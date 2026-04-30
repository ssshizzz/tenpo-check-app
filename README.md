# 店舗チェック・修繕管理 MVP

## 構成

- React / Vite: iPhone向け入力画面
- Google Apps Script: Drive保存、スプレッドシート記録、修繕管理連携
- Google Drive: 店舗チェック画像保存
- Googleスプレッドシート: 日次、週次、修繕管理

## 使用するGoogle ID

- 店舗チェック画像フォルダ: `1r5_Jhg1HnFaOGlXHkhYrvJZmxYN8Na4K`
- ふぐ週次ファイル: `1aRFwmNY7xCUwD999jITQsRZA9oOlpUATngGI2WOFfUI`
- ふぐ日次ファイル: `1PQvFFSRr4tn_gs4nHSseWeSicHsDObwogDXKHUlOGPo`
- 修繕管理ファイル: `1vXevJBB-2UVZSFyD__rhXtauwGnM-5nq8R5ua3kz6XY`

## Apps Script側の設定

1. Apps Scriptプロジェクトを作成する
2. `apps-script/Code.js` の内容を貼り付ける
3. `setupAllSheets()` を1回手動実行する
4. 権限を許可する
5. Webアプリとしてデプロイする
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員、または組織内の全員
6. デプロイURLを控える

## React側の設定

1. `.env.example` を `.env` にコピーする
2. `VITE_APPS_SCRIPT_URL` にApps ScriptのWebアプリURLを入れる
3. ローカル確認

```bash
npm install
npm run dev
```

4. Vercelへデプロイする場合は、環境変数 `VITE_APPS_SCRIPT_URL` を設定する

## 登録ルール

### 日次

- 日次は毎日チェック履歴へ登録
- トイレ、客席、厨房、入口のいずれかが `NG` の場合、修繕管理へ自動登録
- 修繕管理へ登録される場合、説明文と写真は必須

### 週次

- 週次はチェック履歴へ登録
- 設備、内装、導線のいずれかが `C` の場合、修繕管理へ自動登録
- 緊急度が `S` または `A` になり、説明文と写真がある場合も修繕管理へ自動登録

## 評価と緊急度

### 日次

- 全部OK: 総合評価 `S`、緊急度 `C`
- NG 1件: 総合評価 `B`、緊急度 `B`
- NG 2件以上: 総合評価 `C`、緊急度 `S`

### 週次

- 設備、内装、導線のうち一番低い評価を総合評価にする
- 総合評価 `S`: 緊急度 `C`
- 総合評価 `A`: 緊急度 `B`
- 総合評価 `B`: 緊急度 `A`
- 総合評価 `C`: 緊急度 `S`

## 出力列

### 日次

`チェックID / 修繕へ登録ID / 日時 / 店舗名 / 担当者 / トイレ / 客席 / 厨房 / 入口 / 総合評価 / 緊急度(自動) / ファイル名 / 説明文 / 画像URL / サムネイル / 対応ステータス / 対応期限 / 対応完了日 / 備考`

### 週次

`チェックID / 修繕へ登録ID / 日時 / 店舗名 / 担当者 / 設備 / 内装 / 導線 / 総合評価 / 緊急度(自動) / ファイル名 / 説明文 / 画像URL / サムネイル / 対応ステータス / 対応期限 / 対応完了日 / 備考`

### 修繕管理

店舗単位のシートに、修繕IDと元チェックIDを持って登録します。
