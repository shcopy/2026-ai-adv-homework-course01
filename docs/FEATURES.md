# FEATURES.md

## 功能完成狀態總覽

| 功能區塊 | 狀態 |
|----------|------|
| 使用者認證（註冊/登入/個人資料） | ✅ 完成 |
| 商品瀏覽（列表/詳情） | ✅ 完成 |
| 購物車（訪客 + 登入雙模式） | ✅ 完成 |
| 訂單建立與查詢 | ✅ 完成 |
| 模擬付款 | ✅ 完成 |
| 後台商品管理（CRUD） | ✅ 完成 |
| 後台訂單查閱 | ✅ 完成 |
| 前台 EJS 頁面渲染 | ✅ 完成 |
| OpenAPI 文件產生 | ✅ 完成 |
| 綠界金流整合 | ❌ 未實裝（.env 有參數，無對應 code） |

---

## 1. 使用者認證

### 1.1 註冊（POST /api/auth/register）

**必填欄位**：`email`（有效格式）、`password`（至少 6 字元）、`name`

**行為**：
- 驗證欄位格式（正則 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`）
- 確認 email 不重複（若重複 → 409 CONFLICT）
- 以 bcrypt 10 rounds 雜湊密碼
- 新增使用者，role 固定為 `'user'`（無法自行設定為 admin）
- 回傳 `{ user: { id, email, name, role }, token }`，token 有效期 7 天

**錯誤情境**：
- `400 VALIDATION_ERROR`：欄位缺失、email 格式錯誤、密碼少於 6 字元
- `409 CONFLICT`：email 已被註冊

### 1.2 登入（POST /api/auth/login）

**必填欄位**：`email`、`password`

**行為**：
- 查找 email 對應使用者，以 bcrypt 比對密碼
- 成功後發行新 JWT（7 天有效期），回傳 `{ user, token }`
- 不管是 email 不存在還是密碼錯誤，皆回傳相同 `401 UNAUTHORIZED`（防止帳號枚舉）

**錯誤情境**：
- `400 VALIDATION_ERROR`：欄位缺失
- `401 UNAUTHORIZED`：Email 或密碼錯誤

### 1.3 個人資料（GET /api/auth/profile）

**認證**：需 JWT Bearer token

**行為**：從 DB 查回 `id, email, name, role, created_at`，回傳 `data` 即完整 user 物件。

---

## 2. 商品瀏覽（公開，無需認證）

### 2.1 商品列表（GET /api/products）

**查詢參數**：
- `page`：頁碼，預設 `1`，最小值 `1`
- `limit`：每頁筆數，預設 `10`，範圍 `1–100`

**行為**：以 `ORDER BY created_at DESC` 排序，回傳：
```json
{
  "data": {
    "products": [...],
    "pagination": { "total": 8, "page": 1, "limit": 10, "totalPages": 1 }
  }
}
```

### 2.2 商品詳情（GET /api/products/:id）

**行為**：以 UUID 查詢，不存在回 `404 NOT_FOUND`。回傳完整商品物件（含 `stock`、`image_url`）。

---

## 3. 購物車（雙模式認證）

購物車同時支援訪客（X-Session-Id）與登入使用者（Bearer token）。詳見 ARCHITECTURE.md 的「雙模式認證」說明。

### 3.1 查看購物車（GET /api/cart）

**行為**：JOIN products 取出項目資訊，計算 `total = Σ(price × quantity)`，回傳：
```json
{
  "data": {
    "items": [
      {
        "id": "cart-item-uuid",
        "product_id": "product-uuid",
        "quantity": 2,
        "product": { "name": "...", "price": 1680, "stock": 30, "image_url": "..." }
      }
    ],
    "total": 3360
  }
}
```

### 3.2 加入購物車（POST /api/cart）

**必填欄位**：`productId`、`quantity`（正整數，預設 `1`）

**行為（累加邏輯）**：
- 若此 owner（user_id 或 session_id）的購物車已有相同 `productId` → **累加** `quantity`（非覆蓋）
- 累加後檢查是否超過庫存，超過回 `400 STOCK_INSUFFICIENT`
- 新項目直接插入並驗證 quantity ≤ stock

**錯誤情境**：
- `400 VALIDATION_ERROR`：productId 缺失或 quantity 非正整數
- `404 NOT_FOUND`：商品不存在
- `400 STOCK_INSUFFICIENT`：加入後總量超過庫存

### 3.3 修改購物車數量（PATCH /api/cart/:itemId）

**必填**：`quantity`（正整數）

**行為**：覆蓋舊數量（非累加）。驗證 quantity ≤ 庫存，超過回 `400 STOCK_INSUFFICIENT`。只能修改屬於自己（同 user_id 或 session_id）的項目。

### 3.4 移除購物車項目（DELETE /api/cart/:itemId）

**行為**：確認 itemId 屬於此 owner，再刪除。不存在或不屬於此 owner 均回 `404 NOT_FOUND`。

---

## 4. 訂單

訂單 API 全部需要 JWT 認證（不支援 guest session）。

### 4.1 建立訂單（POST /api/orders）

**必填欄位**：`recipientName`、`recipientEmail`（有效格式）、`recipientAddress`

**行為（Transaction 原子操作）**：
1. 取出 `user_id` 對應的所有購物車項目（JOIN products 取得最新庫存）
2. 購物車為空 → `400 CART_EMPTY`
3. 逐項檢查 `quantity ≤ stock`，若有不足 → `400 STOCK_INSUFFICIENT`（列出商品名稱）
4. 計算 `totalAmount = Σ(price × quantity)`
5. 以 `db.transaction()` 執行：
   - INSERT INTO orders
   - INSERT INTO order_items（快照 product_name、product_price）
   - UPDATE products SET stock = stock - quantity（逐商品扣減）
   - DELETE FROM cart_items WHERE user_id = ?（清空購物車）
6. 回傳新建訂單（含 items 陣列）

**訂單編號格式**：`ORD-YYYYMMDD-XXXXX`（5 碼 UUID 前綴大寫）

### 4.2 訂單列表（GET /api/orders）

**行為**：查詢當前登入使用者的所有訂單，`ORDER BY created_at DESC`。回傳陣列（每筆含 `id, order_no, total_amount, status, created_at`，無 items）。

### 4.3 訂單詳情（GET /api/orders/:id）

**行為**：查詢須符合 `id = ? AND user_id = ?`（防止越權存取他人訂單）。回傳完整訂單含 items 陣列（每筆含 `id, product_id, product_name, product_price, quantity`）。

### 4.4 模擬付款（PATCH /api/orders/:id/pay）

**必填欄位**：`action`（`"success"` 或 `"fail"`）

**行為**：
- 確認訂單屬於此使用者且 `status === 'pending'`（非 pending → `400 INVALID_STATUS`）
- `action: "success"` → status 更新為 `'paid'`
- `action: "fail"` → status 更新為 `'failed'`
- 回傳更新後的完整訂單（含 items）

**狀態機**：`pending` → `paid` 或 `failed`（不可逆，paid/failed 無法再付款）

---

## 5. 後台商品管理（需 admin 角色）

### 5.1 後台商品列表（GET /api/admin/products）

與前台商品列表相同邏輯（支援 `page`/`limit` 分頁），差異僅在於需要 JWT + admin 認證。

### 5.2 新增商品（POST /api/admin/products）

**必填欄位**：`name`、`price`（正整數）、`stock`（非負整數）
**選填欄位**：`description`、`image_url`

**行為**：驗證後插入 DB，回傳新建完整商品物件（HTTP 201）。

### 5.3 編輯商品（PUT /api/admin/products/:id）

**選填欄位**：`name`、`description`、`price`、`stock`、`image_url`（皆可選，只更新有傳入的欄位）

**行為**：
- 確認商品存在（不存在 → `404 NOT_FOUND`）
- 各欄位驗證（name 不能是空字串、price 必須正整數、stock 必須非負整數）
- `updated_at` 以 `datetime('now')` 更新

### 5.4 刪除商品（DELETE /api/admin/products/:id）

**行為**：
- 確認商品存在
- 查詢是否有 `status = 'pending'` 的訂單含此商品（JOIN order_items + orders）
- 若有 → `409 CONFLICT`（保護訂單完整性）
- 無 → DELETE（已付款/失敗的訂單因為 order_items 無 FK，不受影響）

---

## 6. 後台訂單查閱（需 admin 角色）

### 6.1 後台訂單列表（GET /api/admin/orders）

**查詢參數**：
- `page`：預設 `1`
- `limit`：預設 `10`，最大 `100`
- `status`：`pending` / `paid` / `failed`（選填，不傳則回傳全部）

**行為**：支援狀態篩選，`ORDER BY created_at DESC`，回傳所有使用者的訂單（無 user_id 過濾）。

### 6.2 後台訂單詳情（GET /api/admin/orders/:id）

**行為**：可查任意使用者的訂單（無 user_id 過濾），額外 JOIN users 回傳下單者的 `{ name, email }`。

---

## 7. 前台 EJS 頁面

所有頁面路由不做 server-side 認證，由前端 JS 處理登入狀態（localStorage 存 token）。

| 頁面 | 對應 JS 模組 | 說明 |
|------|-------------|------|
| `/` | `pages/index.js` | 商品列表、分頁、加入購物車 |
| `/products/:id` | `pages/product-detail.js` | 商品詳情、加入購物車 |
| `/cart` | `pages/cart.js` | 購物車列表、更新數量、移除、前往結帳 |
| `/checkout` | `pages/checkout.js` | 填寫收件資訊、送出訂單 |
| `/login` | `pages/login.js` | 登入與註冊切換 |
| `/orders` | `pages/orders.js` | 我的訂單列表 |
| `/orders/:id` | `pages/order-detail.js` | 訂單詳情、模擬付款按鈕 |
| `/admin/products` | `pages/admin-products.js` | 商品 CRUD 後台介面 |
| `/admin/orders` | `pages/admin-orders.js` | 訂單查閱後台介面 |
