# CLAUDE.md

## 專案概述
花店電商後端 — Express.js + better-sqlite3 + EJS + JWT，提供前台購物流程與後台管理 API，並以 EJS 伺服器端渲染提供完整前端頁面。

## 常用指令

```bash
# 啟動（先建置 CSS 再啟動伺服器）
npm start

# 開發（分開啟動，終端 1 + 終端 2）
node server.js
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch

# 執行測試（全部，依固定順序）
npm test

# 建置 CSS（minify）
npm run css:build

# 產生 OpenAPI spec
npm run openapi
```

## 關鍵規則
- **JWT_SECRET 為啟動必要條件**：`server.js` 啟動時若未設定 `JWT_SECRET` 環境變數，程序會立即 `process.exit(1)`，測試環境除外（`app.js` 直接 import 不經此檢查）
- **購物車雙模式認證**：購物車 API 透過內部 `dualAuth` 函式處理，有 `Authorization: Bearer <token>` 優先走 JWT；若只有 `X-Session-Id` header 則走 guest session；兩者皆無才回 401。其他 API 使用標準 `authMiddleware`
- **訂單建立為 Transaction**：建立訂單（insert order + insert order_items + 扣庫存 + 清空購物車）使用 `better-sqlite3` 的 `db.transaction()` 包裹，確保原子性
- **統一回應格式**：所有 API 一律回傳 `{ data, error, message }`，成功時 `error: null`，失敗時 `data: null`
- **功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/**

## 詳細文件
- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌


## 回覆的語氣
- 請採用文言文的方式，回覆我訊息，以節省回覆的 token (開發上不需要特別節省)