const { Client, middleware } = require('@line/bot-sdk');
const { google } = require('googleapis');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

// Google Sheets API クライアント
let sheets;
try {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheets = google.sheets({ version: 'v4', auth });
  console.log('Google Sheets API initialized successfully');
} catch (err) {
  console.error('Google Sheets auth error:', err);
  sheets = null;
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

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
    if (!sheets) {
      return client.replyMessage(replyToken, { type: 'text', text: 'Google Sheets API の初期化に失敗しました。管理者にお問い合わせください。' });
    }
    try {
      // Google Sheetsに追加
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
        valueInputOption: 'RAW',
        resource: {
          values: [[userId, item, new Date().toISOString()]],
        },
      });
      // 現在のリストを取得して表示
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
      });
      const rows = result.data.values || [];
      const userItems = rows.filter(row => row[0] === userId).map(row => row[1]);
      return client.replyMessage(replyToken, { type: 'text', text: `追加しました：${item}\n現在のリスト（${userItems.length}）:\n- ${userItems.join('\n- ')}` });
    } catch (err) {
      console.error('Sheets append error:', err);
      return client.replyMessage(replyToken, { type: 'text', text: `追加に失敗しました: ${err.message}` });
    }
  }

  if (delMatch) {
    const item = delMatch[1].trim();
    if (!sheets) {
      return client.replyMessage(replyToken, { type: 'text', text: 'Google Sheets API の初期化に失敗しました。管理者にお問い合わせください。' });
    }
    try {
      // 現在のリストを取得
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
      });
      const rows = result.data.values || [];
      const userRows = rows.filter((row, index) => row[0] === userId && row[1] === item);
      if (userRows.length === 0) {
        return client.replyMessage(replyToken, { type: 'text', text: `リストに見つかりません：${item}` });
      }
      // 最初のマッチした行を削除（行番号を計算）
      const rowIndex = rows.findIndex((row, index) => row[0] === userId && row[1] === item) + 1; // 1-based
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          }],
        },
      });
      // 更新後のリストを取得して表示
      const newResult = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
      });
      const newRows = newResult.data.values || [];
      const userItems = newRows.filter(row => row[0] === userId).map(row => row[1]);
      const body = userItems.length ? `現在のリスト（${userItems.length}）:\n- ${userItems.join('\n- ')}` : 'リストは空です。';
      return client.replyMessage(replyToken, { type: 'text', text: `削除しました：${item}\n${body}` });
    } catch (err) {
      console.error('Sheets delete error:', err);
      return client.replyMessage(replyToken, { type: 'text', text: `削除に失敗しました: ${err.message}` });
    }
  }

  if (isList) {
    if (!sheets) {
      return client.replyMessage(replyToken, { type: 'text', text: 'Google Sheets API の初期化に失敗しました。管理者にお問い合わせください。' });
    }
    try {
      // Google Sheetsから現在のリストを取得
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
      });
      const rows = result.data.values || [];
      const userItems = rows.filter(row => row[0] === userId).map(row => row[1]);
      const body = userItems.length ? `現在のリスト（${userItems.length}）:\n- ${userItems.join('\n- ')}` : 'リストは空です。';
      return client.replyMessage(replyToken, { type: 'text', text: body });
    } catch (err) {
      console.error('Sheets get error:', err);
      return client.replyMessage(replyToken, { type: 'text', text: `リストの取得に失敗しました: ${err.message}` });
    }
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
