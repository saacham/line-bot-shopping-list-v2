const line = require('@line/bot-sdk');

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// メインのWebhook処理
export default async function handler(req, res) {
  // POSTリクエストのみ処理
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook受信:', JSON.stringify(req.body));

    // LINE Webhookの署名検証
    const signature = req.headers['x-line-signature'];
    if (!line.validateSignature(JSON.stringify(req.body), config.channelSecret, signature)) {
      console.error('署名検証失敗');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // イベント処理
    const events = req.body.events;
    for (const event of events) {
      await handleEvent(event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook処理でエラー:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// イベント処理
async function handleEvent(event) {
  try {
    console.log('イベント処理:', JSON.stringify(event));

    // メッセージイベントの処理
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const messageText = event.message.text;
      
      console.log(`ユーザー ${userId} からのメッセージ: ${messageText}`);
      
      // コマンドの解析と実行
      const response = await processMessage(messageText, userId);
      
      if (response) {
        await client.replyMessage(event.replyToken, response);
      }
    }
    
    // 友達追加イベント
    else if (event.type === 'follow') {
      console.log('ユーザーが友達追加しました:', event.source.userId);
      const welcomeMessage = {
        type: 'text',
        text: `👋 買い物リスト通知Botへようこそ！

このBotは、指定した店舗に近づくと自動で買い物リストをお知らせします。

まずは「ヘルプ」と送信して、使い方を確認してください。`
      };
      await client.replyMessage(event.replyToken, welcomeMessage);
    }
    
    // ブロックイベント
    else if (event.type === 'unfollow') {
      console.log('ユーザーがブロックしました:', event.source.userId);
    }
    
  } catch (error) {
    console.error('イベント処理でエラー:', error);
  }
}

// メッセージ処理
async function processMessage(message, userId) {
  try {
    const trimmedMessage = message.trim();
    
    // ヘルプコマンド
    if (trimmedMessage === 'ヘルプ' || trimmedMessage === 'help') {
      return {
        type: 'text',
        text: `📋 使用可能なコマンド：

📝 登録 [店舗名] [買うもの,買うもの]
例：登録 イオン 牛乳,パン,卵

🔍 確認 [店舗名]
例：確認 イオン

🗑️ 削除 [店舗名]
例：削除 イオン

✅ 完了 [店舗名]
例：完了 イオン

📋 店舗一覧

位置情報が有効な場合、店舗に近づくと自動で通知が届きます！`
      };
    }
    
    // 店舗一覧コマンド
    else if (trimmedMessage === '店舗一覧') {
      return {
        type: 'text',
        text: '📝 登録されている店舗はありません。\n\n「登録 イオン 牛乳,パン,卵」のようにして店舗を登録してください。'
      };
    }
    
    // 登録コマンド
    else if (trimmedMessage.startsWith('登録 ')) {
      const parts = trimmedMessage.split(' ');
      if (parts.length < 3) {
        return {
          type: 'text',
          text: '❌ 登録コマンドの形式が正しくありません。\n例：登録 イオン 牛乳,パン,卵'
        };
      }
      
      const storeName = parts[1];
      const items = parts.slice(2).join(' ').split(',').map(item => item.trim());
      
      return {
        type: 'text',
        text: `✅ ${storeName} の買い物リストを登録しました。\n\n買うもの：\n${items.map(item => `・${item}`).join('\n')}`
      };
    }
    
    // 確認コマンド
    else if (trimmedMessage.startsWith('確認 ')) {
      const storeName = trimmedMessage.split(' ')[1];
      return {
        type: 'text',
        text: `📝 ${storeName} の買い物リスト：\n・牛乳\n・パン\n・卵`
      };
    }
    
    // 削除コマンド
    else if (trimmedMessage.startsWith('削除 ')) {
      const storeName = trimmedMessage.split(' ')[1];
      return {
        type: 'text',
        text: `✅ ${storeName} の買い物リストを削除しました。`
      };
    }
    
    // 完了コマンド
    else if (trimmedMessage.startsWith('完了 ')) {
      const storeName = trimmedMessage.split(' ')[1];
      return {
        type: 'text',
        text: `✅ ${storeName} の買い物リストを削除しました。`
      };
    }
    
    // 不明なコマンド
    else {
      return {
        type: 'text',
        text: `❌ 不明なコマンド「${trimmedMessage}」です。

❌ 無効なコマンドです。以下のコマンドが使用できます：
• 登録 [店舗名] [買うもの,買うもの]
• 確認 [店舗名]
• 削除 [店舗名]
• 完了 [店舗名]
• 店舗一覧`
      };
    }
    
  } catch (error) {
    console.error('メッセージ処理でエラー:', error);
    return {
      type: 'text',
      text: '❌ エラーが発生しました。しばらくしてからもう一度お試しください。'
    };
  }
}
