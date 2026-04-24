# FEATURES.md

## 功能完成狀態總覽

| 功能區塊 | 狀態 |
|----------|------|
| 使用者認證（註冊/登入/個人資料） | ✅ 完成 |
| 商品瀏覽（列表/詳情） | ✅ 完成 |
| 購物車（訪客 + 登入雙模式） | ✅ 完成 |
| 訂單建立與查詢 | ✅ 完成 |
| 後台商品管理（CRUD） | ✅ 完成 |
| 後台訂單查閱 | ✅ 完成 |
| 前台 EJS 頁面渲染 | ✅ 完成 |
| OpenAPI 文件產生 | ✅ 完成 |
| 綠界 AIO 金流整合 | ✅ 完成 |

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

### 4.4 取得綠界 AIO 表單參數（GET /api/orders/:id/ecpay-params）

**認證**：JWT Bearer token

**查詢參數**：
- `choosePayment`（選填）：指定付款方式（`ALL` / `Credit` / `WebATM` / `ATM` / `CVS` / `BARCODE` / `ApplePay` / `TWQR` / `BNPL` / `WeiXin` / `DigitalPayment`），不傳預設為 `ALL`（讓使用者在綠界頁面自行選擇）

**行為**：
- 確認訂單屬於此使用者且 `status === 'pending'`（非 pending → `400 INVALID_STATUS`）
- 確認訂單有 `merchant_trade_no`（舊訂單若缺失 → `400 VALIDATION_ERROR`）
- 從 `order_items` 取商品名稱組成 `ItemName`（以 `#` 分隔，超過 200 字元自動截斷）
- 計算 `CheckMacValue`（SHA256，依 ECPay 規格的 ecpayUrlEncode 演算法）
- 回傳完整 AIO 表單參數與送出目標 URL：
  ```json
  {
    "data": {
      "action": "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
      "params": {
        "MerchantID": "3002607",
        "MerchantTradeNo": "EC1745...",
        "MerchantTradeDate": "2026/04/24 14:00:00",
        "PaymentType": "aio",
        "TotalAmount": "1680",
        "TradeDesc": "花店訂單",
        "ItemName": "浪漫玫瑰花束",
        "ReturnURL": "http://localhost:3001/api/ecpay/notify",
        "ChoosePayment": "ALL",
        "EncryptType": "1",
        "ClientBackURL": "http://localhost:3001/orders/:id?payment=done",
        "CheckMacValue": "..."
      }
    }
  }
  ```

前端收到後應動態建立隱藏 `<form>` 並 POST submit，瀏覽器會自動跳轉至綠界付款頁。

### 4.5 主動查詢付款結果（POST /api/orders/:id/verify-payment）

**認證**：JWT Bearer token

**行為**：
- 以訂單的 `merchant_trade_no` 呼叫綠界 `QueryTradeInfo/V5` API（POST form-urlencoded）
- 解析回應的 URL-encoded 字串取得 `TradeStatus`
- `TradeStatus === '1'` → 更新 status 為 `'paid'`
- `TradeStatus === '0'`（尚未付款）→ 維持 `'pending'`，不更新
- 其他值（交易異常、取消）→ 更新 status 為 `'failed'`
- 回傳更新後的完整訂單（含 items）

**錯誤情境**：
- `400 VALIDATION_ERROR`：訂單缺少 merchant_trade_no
- `404 NOT_FOUND`：訂單不存在
- `502 ECPAY_ERROR`：無法連線至綠界查詢 API

**狀態機**：`pending` → `paid` 或 `failed`（不可逆）

**本地開發限制**：因 localhost 無法接收綠界 Server-to-Server ReturnURL callback，付款結果確認須由使用者返回訂單詳情頁後手動點「確認付款結果」觸發此 API。

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
| `/checkout` | `pages/checkout.js` | 填寫收件資訊、送出訂單，建立後自動導向綠界付款頁 |
| `/login` | `pages/login.js` | 登入與註冊切換 |
| `/orders` | `pages/orders.js` | 我的訂單列表 |
| `/orders/:id` | `pages/order-detail.js` | 訂單詳情、「前往綠界付款」與「確認付款結果」按鈕 |
| `/admin/products` | `pages/admin-products.js` | 商品 CRUD 後台介面 |
| `/admin/orders` | `pages/admin-orders.js` | 訂單查閱後台介面 |

---

## 8. 綠界 AIO 金流整合

### 8.1 整合架構

本專案採 ECPay AIO（全方位金流）測試環境，使用 CheckMacValue SHA256 認證方式。由於本機開發無法對外提供 ReturnURL，付款驗證改以**本地端主動查詢**取代被動接收 Callback。

**付款流程**：

```
使用者填寫結帳表單
  → POST /api/orders（建立訂單，含 merchant_trade_no）
  → GET /api/orders/:id/ecpay-params（取得含 CheckMacValue 的表單參數）
  → 前端動態建立隱藏 <form> 並 POST submit
  → 瀏覽器跳轉至綠界付款頁（使用者選擇付款方式並完成付款）
  → 綠界 ClientBackURL 導回 /orders/:id?payment=done
  → 使用者點「確認付款結果」
  → POST /api/orders/:id/verify-payment（呼叫 QueryTradeInfo/V5 查詢）
  → 更新訂單 status
```

### 8.2 環境設定（.env）

| 變數 | 說明 | 測試值 |
|------|------|--------|
| `ECPAY_MERCHANT_ID` | 特店編號 | `3002607` |
| `ECPAY_HASH_KEY` | HashKey | `pwFHCqoQZGmho4w6` |
| `ECPAY_HASH_IV` | HashIV | `EkRm7iFT261dpevs` |
| `ECPAY_ENV` | 環境切換 | `staging`（正式環境設為 `production`） |
| `BASE_URL` | 本機服務 URL，用於組 ReturnURL 與 ClientBackURL | `http://localhost:3001` |

### 8.3 核心工具模組（src/lib/ecpay.js）

| 函式 | 說明 |
|------|------|
| `ecpayUrlEncode(source)` | ECPay 專用 URL encode（urlencode → 轉小寫 → .NET 特殊字元還原） |
| `generateCheckMacValue(params)` | 產生 CheckMacValue（SHA256，Key 不區分大小寫排序） |
| `buildAioParams(order, items, returnUrl, clientBackUrl, choosePayment)` | 組合完整 AIO 建單參數，包含 CheckMacValue |
| `queryTradeInfo(merchantTradeNo)` | 呼叫 ECPay QueryTradeInfo/V5，回傳解析後的 key-value 物件 |

### 8.4 付款方式

`ChoosePayment` 參數支援值：

| 值 | 說明 |
|----|------|
| `ALL`（預設） | 讓使用者在綠界頁面自行選擇所有可用方式 |
| `Credit` | 信用卡（含分期、定期定額） |
| `WebATM` | 網路 ATM |
| `ATM` | ATM 轉帳（非即時，需等待轉帳到帳） |
| `CVS` | 超商代碼繳費（非即時） |
| `BARCODE` | 超商條碼繳費（非即時） |
| `ApplePay` | Apple Pay |
| `TWQR` | 台灣 Pay（TWQR） |
| `BNPL` | 先買後付 |
| `WeiXin` | 微信支付 |
| `DigitalPayment` | 數位支付 |

> ⚠️ ATM、CVS、BARCODE 為非即時付款方式，使用者取號後需另行繳費，`verify-payment` 在繳費完成前查詢會維持 `pending`。

### 8.5 MerchantTradeNo 格式

格式：`EC` + `Date.now()`（例：`EC1745483200000`，共 15 碼英數字），唯一性由時間戳保證。儲存於 `orders.merchant_trade_no` 欄位。
