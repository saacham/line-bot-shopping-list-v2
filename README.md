# LINE Bot for Shopping List Notifications

位置連動型買い物リスト通知システムのLINE Botです。

## 機能

- 📝 買い物リストの登録・確認・削除
- 📍 位置情報に基づく自動通知（将来実装予定）
- ✅ 買い物完了の管理

## コマンド

- `ヘルプ` - 使用可能なコマンドを表示
- `登録 [店舗名] [買うもの,買うもの]` - 買い物リストを登録
- `確認 [店舗名]` - 買い物リストを確認
- `削除 [店舗名]` - 買い物リストを削除
- `完了 [店舗名]` - 買い物を完了
- `店舗一覧` - 登録済み店舗一覧を表示

## セットアップ

1. Vercelにデプロイ
2. 環境変数を設定：
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
3. LINE DevelopersでWebhook URLを設定

## デプロイ

```bash
npm install
vercel --prod
```
