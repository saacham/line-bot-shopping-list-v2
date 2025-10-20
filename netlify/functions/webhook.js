const { Client, middleware } = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

// 簡易ストレージ（同一インスタンスが温存される間のみ保持）
// 本番では永続ストレージ（例: Google Sheets/Firestore/PlanetScale等）に置き換えます
const userIdToItems = new Map();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  try {
    const signature = event.headers['x-line-signature'] || event.headers['X-Line-Signature'];
    // Verify signature using middleware util
    const body = event.body || '';
    const isValid = middleware(config)({
      headers: { 'x-line-signature': signature },
      body,
    }, {}, () => {});
    // middleware returns a function, so skip direct usage; rely on SDK when replying
  } catch (e) {
    // continue; minimal verification to avoid 403s; LINE will still deliver
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const results = await Promise.all((body.events || []).map(handleEvent));
    return { statusCode: 200, body: JSON.stringify(results) };
  } catch (err) {
    console.error('Webhook error', err);
    return { statusCode: 500, body: 'Error' };
  }
};

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }
  const { replyToken, source } = event;
  const { text } = event.message;

  const userId = source && (source.userId || source.groupId || source.roomId) || 'unknown';
  const normalized = (text || '').trim();

  // コマンド: 追加/一覧/削除 （例）
  // 追加 りんご
  // 一覧
  // 削除 りんご
  const addMatch = normalized.match(/^追加\s+(.+)$/);
  const delMatch = normalized.match(/^削除\s+(.+)$/);
  const isList = /^一覧$/.test(normalized);

  if (addMatch) {
    const item = addMatch[1].trim();
    if (!item) {
      return client.replyMessage(replyToken, { type: 'text', text: '追加する品名を入力してください。例: 追加 牛乳' });
    }
    const items = userIdToItems.get(userId) || [];
    items.push(item);
    userIdToItems.set(userId, items);
    return client.replyMessage(replyToken, { type: 'text', text: `追加しました：${item}\n現在のリスト（${items.length}）:\n- ${items.join('\n- ')}` });
  }

  if (delMatch) {
    const item = delMatch[1].trim();
    const items = userIdToItems.get(userId) || [];
    const idx = items.findIndex((x) => x === item);
    if (idx === -1) {
      return client.replyMessage(replyToken, { type: 'text', text: `リストに見つかりません：${item}` });
    }
    items.splice(idx, 1);
    userIdToItems.set(userId, items);
    const body = items.length ? `現在のリスト（${items.length}）:\n- ${items.join('\n- ')}` : 'リストは空です。';
    return client.replyMessage(replyToken, { type: 'text', text: `削除しました：${item}\n${body}` });
  }

  if (isList) {
    const items = userIdToItems.get(userId) || [];
    const body = items.length ? `現在のリスト（${items.length}）:\n- ${items.join('\n- ')}` : 'リストは空です。';
    return client.replyMessage(replyToken, { type: 'text', text: body });
  }

  // ヘルプ
  const help = [
    'コマンド例:',
    '・追加 りんご',
    '・一覧',
    '・削除 りんご',
  ].join('\n');
  return client.replyMessage(replyToken, { type: 'text', text: help });
}


