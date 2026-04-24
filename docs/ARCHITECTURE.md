# ARCHITECTURE.md

## 目錄結構

```
├── app.js                         # Express app 初始化（middleware、路由掛載）
├── server.js                      # HTTP 伺服器入口，啟動前驗證 JWT_SECRET
├── generate-openapi.js            # 讀取路由 JSDoc，產生 openapi.json
├── swagger-config.js              # swagger-jsdoc 設定（API info、securitySchemes）
├── vitest.config.js               # Vitest 設定（測試執行順序、不平行）
├── database.sqlite                # SQLite 資料庫檔案（執行期自動建立）
│
├── src/
│   ├── database.js                # DB 連線 + 建立所有資料表 + 植入種子資料
│   ├── middleware/
│   │   ├── authMiddleware.js      # JWT Bearer 驗證，解碼後掛到 req.user
│   │   ├── adminMiddleware.js     # 檢查 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js   # 從 X-Session-Id header 取 sessionId 掛到 req.sessionId
│   │   └── errorHandler.js       # Express 全域錯誤處理，500 不洩漏細節
│   └── routes/
│       ├── authRoutes.js          # POST /register, POST /login, GET /profile
│       ├── productRoutes.js       # GET /products, GET /products/:id（公開）
│       ├── cartRoutes.js          # GET/POST /cart, PATCH/DELETE /cart/:itemId（雙模式認證）
│       ├── orderRoutes.js         # POST/GET /orders, GET /orders/:id, PATCH /orders/:id/pay
│       ├── adminProductRoutes.js  # GET/POST /admin/products, PUT/DELETE /admin/products/:id
│       ├── adminOrderRoutes.js    # GET /admin/orders, GET /admin/orders/:id
│       └── pageRoutes.js          # 所有 EJS 頁面路由（/ /products/:id /cart /checkout ...）
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs              # 前台版型（含 head、header、footer partials）
│   │   └── admin.ejs              # 後台版型（含 admin-header、admin-sidebar partials）
│   ├── pages/
│   │   ├── index.ejs              # 首頁商品列表
│   │   ├── product-detail.ejs     # 商品詳情
│   │   ├── cart.ejs               # 購物車
│   │   ├── checkout.ejs           # 結帳
│   │   ├── login.ejs              # 登入
│   │   ├── orders.ejs             # 我的訂單列表
│   │   ├── order-detail.ejs       # 訂單詳情（含付款結果顯示）
│   │   ├── 404.ejs                # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs       # 後台商品管理
│   │       └── orders.ejs         # 後台訂單管理
│   └── partials/
│       ├── head.ejs               # <head> 標籤（CSS、meta）
│       ├── header.ejs             # 前台導覽列
│       ├── footer.ejs             # 頁尾
│       ├── notification.ejs       # 通知 Toast 元件
│       ├── admin-header.ejs       # 後台頂部列
│       └── admin-sidebar.ejs      # 後台側邊欄
│
├── public/
│   ├── css/
│   │   ├── input.css              # Tailwind CSS 來源（@import tailwindcss）
│   │   └── output.css             # 建置產出（git 追蹤，已 minify）
│   ├── stylesheets/style.css      # 額外自訂全域樣式
│   └── js/
│       ├── api.js                 # fetch 封裝（ApiClient class），含 JWT + sessionId header 注入
│       ├── auth.js                # 前端登入狀態管理（localStorage token）
│       ├── header-init.js         # 頁面載入時初始化導覽列登入狀態
│       ├── notification.js        # Toast 通知函式
│       └── pages/                 # 各頁面獨立 JS 模組
│           ├── index.js           # 首頁：商品列表、分頁、加入購物車
│           ├── product-detail.js  # 商品詳情：加入購物車
│           ├── cart.js            # 購物車：列出、更新數量、移除
│           ├── checkout.js        # 結帳：提交訂單
│           ├── login.js           # 登入/註冊表單
│           ├── orders.js          # 我的訂單列表
│           ├── order-detail.js    # 訂單詳情 + 模擬付款
│           ├── admin-products.js  # 後台商品 CRUD
│           └── admin-orders.js    # 後台訂單列表與詳情
│
└── tests/
    ├── setup.js                   # 測試共用輔助函式（getAdminToken、registerUser）
    ├── auth.test.js
    ├── products.test.js
    ├── cart.test.js
    ├── orders.test.js
    ├── adminProducts.test.js
    └── adminOrders.test.js
```

## 啟動流程

```
npm start
  └─ npm run css:build           → Tailwind CLI 建置 output.css
  └─ node server.js
       ├─ require('./app')
       │    ├─ require('dotenv').config()   → 載入 .env
       │    ├─ require('./src/database')    → 連線 SQLite，CREATE TABLE IF NOT EXISTS，seedAdmin，seedProducts
       │    ├─ app.use(cors)               → FRONTEND_URL 或 http://localhost:3001
       │    ├─ app.use(express.json)
       │    ├─ app.use(sessionMiddleware)   → 解析 X-Session-Id header
       │    ├─ app.use('/api/auth', ...)
       │    ├─ app.use('/api/admin/products', ...)
       │    ├─ app.use('/api/admin/orders', ...)
       │    ├─ app.use('/api/products', ...)
       │    ├─ app.use('/api/cart', ...)
       │    ├─ app.use('/api/orders', ...)
       │    ├─ app.use('/', pageRoutes)
       │    ├─ 404 handler（API 回 JSON，頁面回 404.ejs）
       │    └─ errorHandler
       ├─ 檢查 JWT_SECRET（未設定則 process.exit(1)）
       └─ app.listen(PORT)         → 預設 3001
```

## API 路由總覽

| 前綴 | 檔案 | 認證 | 說明 |
|------|------|------|------|
| `POST /api/auth/register` | authRoutes.js | 無 | 註冊新帳號 |
| `POST /api/auth/login` | authRoutes.js | 無 | 登入取得 JWT |
| `GET /api/auth/profile` | authRoutes.js | JWT | 取得個人資料 |
| `GET /api/products` | productRoutes.js | 無 | 商品列表（分頁） |
| `GET /api/products/:id` | productRoutes.js | 無 | 商品詳情 |
| `GET /api/cart` | cartRoutes.js | JWT 或 Session | 查看購物車 |
| `POST /api/cart` | cartRoutes.js | JWT 或 Session | 加入購物車 |
| `PATCH /api/cart/:itemId` | cartRoutes.js | JWT 或 Session | 修改數量 |
| `DELETE /api/cart/:itemId` | cartRoutes.js | JWT 或 Session | 移除項目 |
| `POST /api/orders` | orderRoutes.js | JWT | 從購物車建立訂單 |
| `GET /api/orders` | orderRoutes.js | JWT | 自己的訂單列表 |
| `GET /api/orders/:id` | orderRoutes.js | JWT | 訂單詳情 |
| `PATCH /api/orders/:id/pay` | orderRoutes.js | JWT | 模擬付款 |
| `GET /api/admin/products` | adminProductRoutes.js | JWT + admin | 後台商品列表 |
| `POST /api/admin/products` | adminProductRoutes.js | JWT + admin | 新增商品 |
| `PUT /api/admin/products/:id` | adminProductRoutes.js | JWT + admin | 編輯商品 |
| `DELETE /api/admin/products/:id` | adminProductRoutes.js | JWT + admin | 刪除商品 |
| `GET /api/admin/orders` | adminOrderRoutes.js | JWT + admin | 後台訂單列表（可篩選狀態） |
| `GET /api/admin/orders/:id` | adminOrderRoutes.js | JWT + admin | 後台訂單詳情（含 user 資訊） |

## 統一回應格式

所有 API 端點均回傳相同外殼結構：

```json
// 成功
{
  "data": { ... },
  "error": null,
  "message": "成功"
}

// 失敗
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "email、password、name 為必填欄位"
}
```

**錯誤碼一覽**

| error 值 | HTTP 狀態 | 說明 |
|----------|-----------|------|
| `VALIDATION_ERROR` | 400 | 欄位缺失或格式錯誤 |
| `UNAUTHORIZED` | 401 | 未登入、Token 無效或過期 |
| `FORBIDDEN` | 403 | 權限不足（非 admin） |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | Email 已存在 / 商品有未完成訂單 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `CART_EMPTY` | 400 | 購物車為空無法結帳 |
| `INVALID_STATUS` | 400 | 訂單狀態不是 pending，無法付款 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤（不洩漏細節） |

## 認證與授權機制

### 標準 JWT 認證（authMiddleware）

用於 `/api/auth/profile`、`/api/orders/*`、`/api/admin/*` 所有路由。

1. 讀取 `Authorization: Bearer <token>` header
2. 以 `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` 驗證
3. 用 `decoded.userId` 至 DB 確認使用者存在（防止 token 有效但帳號已刪除）
4. 掛載 `req.user = { userId, email, role }` 供後續 handler 使用
5. 任一步驟失敗均回 `401 UNAUTHORIZED`

**JWT 參數**
- 演算法：HS256
- 有效期：`7d`（7 天）
- Payload 欄位：`userId`、`email`、`role`

### Admin 授權（adminMiddleware）

必須在 `authMiddleware` 之後使用（兩者通常用 `router.use(authMiddleware, adminMiddleware)` 串接）。

- 檢查 `req.user.role === 'admin'`
- 失敗回 `403 FORBIDDEN`

### 購物車雙模式認證（dualAuth，僅 cartRoutes）

購物車支援訪客（guest）與登入使用者共用同一套 API：

```
請求進入 dualAuth
    │
    ├─ 有 Authorization header？
    │       ├─ 驗證 JWT 成功 → req.user 掛載 → next()
    │       └─ JWT 無效 → 立即 401（不 fallback 到 session）
    │
    ├─ 無 Authorization，但有 X-Session-Id？
    │       └─ req.sessionId 掛載（由 sessionMiddleware 預先解析）→ next()
    │
    └─ 兩者皆無 → 401
```

`getOwnerCondition(req)` 決定 DB 查詢條件：
- 有 `req.user` → `WHERE user_id = ?`
- 否則 → `WHERE session_id = ?`

## 資料庫 Schema

資料庫：SQLite，WAL 模式，外鍵約束啟用（`PRAGMA foreign_keys = ON`）。

### users

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| email | TEXT | UNIQUE NOT NULL | 登入用 Email |
| password_hash | TEXT | NOT NULL | bcrypt 雜湊 |
| name | TEXT | NOT NULL | 顯示名稱 |
| role | TEXT | NOT NULL, DEFAULT 'user', CHECK(IN 'user','admin') | 角色 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間（ISO 8601） |

### products

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | — | 商品描述 |
| price | INTEGER | NOT NULL, CHECK(> 0) | 單價（新台幣，整數） |
| stock | INTEGER | NOT NULL, DEFAULT 0, CHECK(>= 0) | 庫存數量 |
| image_url | TEXT | — | 商品圖片 URL |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | 最後更新時間（PUT 時手動更新） |

### cart_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| session_id | TEXT | — | 訪客 session ID（與 user_id 擇一有值） |
| user_id | TEXT | FK → users.id | 登入使用者 ID（與 session_id 擇一有值） |
| product_id | TEXT | NOT NULL, FK → products.id | 商品 ID |
| quantity | INTEGER | NOT NULL, DEFAULT 1, CHECK(> 0) | 數量 |

> 注意：`session_id` 與 `user_id` 之間無 DB 層面的互斥約束，由應用層 `dualAuth` 控制，兩者不會同時有值。

### orders

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| order_no | TEXT | UNIQUE NOT NULL | 訂單編號，格式 `ORD-YYYYMMDD-XXXXX`（隨機 5 碼大寫） |
| user_id | TEXT | NOT NULL, FK → users.id | 下單使用者 |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| total_amount | INTEGER | NOT NULL | 訂單總金額（新台幣） |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK(IN 'pending','paid','failed') | 訂單狀態 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |

### order_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| order_id | TEXT | NOT NULL, FK → orders.id | 所屬訂單 |
| product_id | TEXT | NOT NULL | 商品 ID（快照用，不設 FK 以允許商品刪除） |
| product_name | TEXT | NOT NULL | 下單當下商品名稱（快照） |
| product_price | INTEGER | NOT NULL | 下單當下商品價格（快照） |
| quantity | INTEGER | NOT NULL | 購買數量 |

> `order_items.product_id` 無外鍵約束，是刻意設計：商品可被刪除，但歷史訂單的名稱與價格已快照在 `product_name`/`product_price`。

## 頁面路由（EJS 渲染）

| URL | Layout | 說明 |
|-----|--------|------|
| `GET /` | front | 首頁，顯示商品列表 |
| `GET /products/:id` | front | 商品詳情 |
| `GET /cart` | front | 購物車 |
| `GET /checkout` | front | 結帳頁面 |
| `GET /login` | front | 登入/註冊 |
| `GET /orders` | front | 我的訂單列表 |
| `GET /orders/:id` | front | 訂單詳情（`?payment=success/fail` 顯示付款結果） |
| `GET /admin/products` | admin | 後台商品管理 |
| `GET /admin/orders` | admin | 後台訂單管理 |

頁面路由不做任何認證，認證邏輯全在各頁面的前端 JS 中處理（若未登入則 redirect 至 `/login`）。
