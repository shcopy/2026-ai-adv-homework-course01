# DEVELOPMENT.md

## 環境變數

複製 `.env.example` 為 `.env`，依需求填入：

| 變數 | 用途 | 必要性 | 預設值（.env.example） |
|------|------|--------|------------------------|
| `JWT_SECRET` | JWT 簽名金鑰 | **必要**（伺服器啟動時驗證） | `your-jwt-secret-key-here` |
| `BASE_URL` | 伺服器基底 URL | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許來源 | 選填 | `http://localhost:5173` |
| `ADMIN_EMAIL` | 種子管理員帳號 Email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 種子管理員密碼 | 選填 | `12345678` |
| `PORT` | HTTP 監聽埠 | 選填 | `3001`（server.js 硬設預設） |
| `ECPAY_MERCHANT_ID` | 綠界特店編號（未實裝） | 選填 | `3002607` |
| `ECPAY_HASH_KEY` | 綠界 HashKey（未實裝） | 選填 | `pwFHCqoQZGmho4w6` |
| `ECPAY_HASH_IV` | 綠界 HashIV（未實裝） | 選填 | `EkRm7iFT261dpevs` |
| `ECPAY_ENV` | 綠界環境（未實裝） | 選填 | `staging` |

> `JWT_SECRET` 缺少時，`server.js` 在 `app.listen` 前即 `process.exit(1)`。但測試環境直接 `require('./app')`，不經過此檢查，所以測試執行時也需在 `.env` 設定或由 CI 注入。

## 模組系統說明

此專案混用兩種模組系統：

- **後端（src/、routes/、app.js、server.js）**：使用 **CommonJS**（`require` / `module.exports`）
- **測試設定（vitest.config.js）**：使用 **ESM**（`import` / `export default`），因 Vitest 預設 ESM
- **前端 JS（public/js/）**：透過 `<script src="...">` 引入，無模組系統（全域函式）

新增後端模組時，請使用 CommonJS。

## 命名規則

| 對象 | 規則 | 範例 |
|------|------|------|
| 檔案名稱（後端） | camelCase | `authRoutes.js`、`adminMiddleware.js` |
| 檔案名稱（前端 JS） | kebab-case | `admin-products.js`、`header-init.js` |
| 檔案名稱（EJS 頁面） | kebab-case | `product-detail.ejs`、`order-detail.ejs` |
| 資料庫欄位 | snake_case | `user_id`、`order_no`、`created_at` |
| API 請求 body 欄位 | camelCase | `productId`、`recipientName`、`recipientEmail` |
| API 回應 data 欄位 | snake_case（直接從 DB 回傳） | `order_no`、`total_amount`、`created_at` |
| 環境變數 | UPPER_SNAKE_CASE | `JWT_SECRET`、`ADMIN_EMAIL` |
| Express router 變數 | `router` | `const router = express.Router()` |
| DB 查詢變數 | 語義命名 | `const existing = db.prepare(...).get(...)` |

> API 請求 body 使用 camelCase，而回應的 data 直接從 DB 查詢結果回傳（snake_case）。前端在呼叫 API 時需注意此不對稱性。

## 新增 API 路由步驟

1. **建立或選擇 route 檔案**：在 `src/routes/` 下建立或修改對應的 `*Routes.js`
2. **加入 JSDoc OpenAPI 註解**：參考現有路由的 `@openapi` 格式（見下方範例）
3. **掛載路由**：在 `app.js` 加入 `app.use('/api/<prefix>', require('./src/routes/<file>'))`
4. **遵循回應格式**：回傳 `{ data, error: null, message }` 或 `{ data: null, error: 'ERROR_CODE', message }`

**JSDoc 格式範例**
```javascript
/**
 * @openapi
 * /api/example:
 *   post:
 *     summary: 功能摘要
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field1]
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功
 */
router.post('/example', authMiddleware, (req, res) => {
  // ...
  res.json({ data: result, error: null, message: '成功' });
});
```

## 新增 Middleware 步驟

1. 在 `src/middleware/` 建立 `<name>Middleware.js`
2. 實作 `function middlewareName(req, res, next) { ... }`
3. 以 `module.exports = middlewareName` 匯出
4. 在需要的 route 檔案中 `require` 並使用

## 新增資料庫資料表步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 函式內，於 `db.exec(...)` 的 SQL 字串中加入 `CREATE TABLE IF NOT EXISTS <name> (...)`
2. 若需種子資料，新增 `seed<TableName>()` 函式並在 `initializeDatabase()` 中呼叫
3. 資料表欄位命名使用 snake_case，主鍵使用 UUID v4

## 計畫歸檔流程

新功能開發前，在 `docs/plans/` 建立計畫文件；功能完成後移至 `docs/plans/archive/`。

1. **計畫檔案命名格式**：`YYYY-MM-DD-<feature-name>.md`
   - 例：`2026-04-22-payment-integration.md`
2. **計畫文件結構**：
   ```markdown
   # <功能名稱> 開發計畫
   
   ## User Story
   身為 <角色>，我希望 <行為>，以便 <目的>。
   
   ## Spec（規格）
   - 端點：...
   - 行為：...
   - 錯誤情境：...
   
   ## Tasks
   - [ ] 建立 route 檔案
   - [ ] 實作業務邏輯
   - [ ] 加入測試
   - [ ] 更新 FEATURES.md
   - [ ] 更新 CHANGELOG.md
   ```
3. **功能完成後**：
   - `mv docs/plans/<file>.md docs/plans/archive/`
   - 更新 `docs/FEATURES.md` 對應功能的完成狀態
   - 在 `docs/CHANGELOG.md` 新增版本記錄
