# 花店電商後端

花卉商品電商平台，提供前台購物流程（瀏覽商品、購物車、結帳、訂單追蹤）與後台管理（商品 CRUD、訂單查閱）。後端以 Express.js 實作 REST API 並以 EJS 伺服器端渲染頁面。

## 技術棧

| 類別 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express.js 4.x |
| 資料庫 | SQLite（better-sqlite3，WAL 模式） |
| 模板引擎 | EJS 5.x（伺服器端渲染） |
| 認證 | JWT（jsonwebtoken，HS256，有效期 7 天） |
| 密碼雜湊 | bcrypt（10 rounds；測試環境 1 round） |
| UUID | uuid v4 |
| CSS | Tailwind CSS 4.x（CLI 建置） |
| 測試 | Vitest + Supertest |
| API 文件 | swagger-jsdoc（OpenAPI 3.0） |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數範本
cp .env.example .env

# 3. 編輯 .env，至少設定 JWT_SECRET
#    JWT_SECRET=your-secret-here

# 4. 啟動（自動建置 CSS 後啟動伺服器）
npm start

# 瀏覽器開啟
open http://localhost:3001
```

> 資料庫 `database.sqlite` 在首次啟動時自動建立，並植入 8 筆種子商品與管理員帳號。

**預設管理員帳號**
- Email：`admin@hexschool.com`
- 密碼：`12345678`

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 建置 CSS + 啟動伺服器 |
| `node server.js` | 僅啟動伺服器（不重建 CSS） |
| `npm run dev:css` | 監聽 CSS 變更並即時重建 |
| `npm run css:build` | 一次性建置並 minify CSS |
| `npm test` | 執行全部測試（固定順序） |
| `npm run openapi` | 產生 `openapi.json` 規格文件 |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、API 路由總覽、資料庫 Schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、環境變數、新增功能步驟 |
| [FEATURES.md](./FEATURES.md) | 功能清單與完成狀態、業務邏輯說明 |
| [TESTING.md](./TESTING.md) | 測試規範、執行順序、輔助函式說明 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
