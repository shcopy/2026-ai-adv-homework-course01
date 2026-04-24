# ECPay 綠界金流串接計畫

## Context

本專案為花店電商後端，已具備完整購物車與訂單建立流程，但付款僅為模擬（PATCH /api/orders/:id/pay）。
目標：串接綠界 AIO 全方位金流（測試環境），讓使用者可真實前往綠界付款頁完成信用卡付款。

**特殊限制**：本專案僅運行於 localhost，無法接收綠界 Server-to-Server ReturnURL Callback。
因此付款驗證改為**本地端主動呼叫 `/Cashier/QueryTradeInfo/V5`** 查詢付款結果。

---

## 付款流程設計

```
使用者填寫結帳表單
  → POST /api/orders（建立訂單，含 merchant_trade_no）
  → GET  /api/orders/:id/ecpay-params（取得 ECPay 表單參數 + CheckMacValue）
  → 前端動態建立隱藏 form 並 submit → 導向綠界付款頁
  → 使用者在綠界完成付款
  → 綠界 ClientBackURL 導回 /orders/:id?payment=done
  → 使用者點「確認付款結果」→ POST /api/orders/:id/verify-payment
  → 後端呼叫 ECPay QueryTradeInfo/V5 → 解析回應 → 更新 status
```

---

## 測試帳號（.env 已有）

| 項目 | 值 |
|------|-----|
| MerchantID | 3002607 |
| HashKey | pwFHCqoQZGmho4w6 |
| HashIV | EkRm7iFT261dpevs |
| 測試信用卡 | 4311-9522-2222-2222，CVV 222，3DS 1234 |
| AIO 建單端點 | https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5 |
| 查詢端點 | https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5 |

---

## 需修改 / 新建的檔案

### 1. `src/database.js`
新增遷移段落（已建立資料表後執行）：

```js
// 安全新增欄位（若已存在則忽略）
try {
  db.exec("ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT");
} catch (_) {}
```

`merchant_trade_no` 格式：`EC` + `Date.now()`（共 15 碼，英數字，唯一性由時間戳保證）。

---

### 2. `src/lib/ecpay.js`（新建）

提供三個函式：

```js
// ECPay 專用 URL encode（對應 PHP SDK UrlService::ecpayUrlEncode）
function ecpayUrlEncode(source) { ... }

// 計算 CheckMacValue（SHA256，params 物件 → 大寫 hex）
function generateCheckMacValue(params) { ... }
  // 使用 HashKey/HashIV from process.env
  // 依 guides/13-checkmacvalue.md Node.js 實作

// 主動查詢 ECPay 訂單狀態
async function queryTradeInfo(merchantTradeNo) { ... }
  // POST https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5
  // 參數：MerchantID, MerchantTradeNo, TimeStamp, CheckMacValue
  // 回應：URL-encoded 字串 → parse → 回傳 { tradeStatus, rtnMsg, ... }
  // 使用 Node.js built-in https module（無需新增依賴）
  // TradeStatus === '1' 表示已付款
```

---

### 3. `src/routes/orderRoutes.js`

**修改 `POST /api/orders`**：
- 建立 `merchant_trade_no = 'EC' + Date.now()`
- INSERT 時多存 `merchant_trade_no`

**新增 `GET /api/orders/:id/ecpay-params`**：
- 查訂單 + order_items
- 組 ItemName（items.map(i => i.product_name).join('#')，截斷至 200 字元）
- 組 MerchantTradeDate（`YYYY/MM/DD HH:mm:ss`）
- 計算 CheckMacValue
- 回傳 JSON：
  ```json
  {
    "data": {
      "action": "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
      "params": { /* 所有 AIO 必填欄位 + CheckMacValue */ }
    }
  }
  ```
- 關鍵欄位：
  - `ReturnURL`：`BASE_URL + /api/ecpay/notify`（ECPay 無法呼叫，僅佔位）
  - `ClientBackURL`：`BASE_URL + /orders/:id?payment=done`
  - `ChoosePayment`：`Credit`
  - `EncryptType`：`1`

**新增 `POST /api/orders/:id/verify-payment`**：
- 從 DB 取 merchant_trade_no
- 呼叫 `queryTradeInfo(merchantTradeNo)`
- 若 `TradeStatus === '1'` → UPDATE orders SET status = 'paid'
- 否則若狀態非 '0'（取消）→ UPDATE orders SET status = 'failed'
- 回傳更新後的完整訂單（含 items）

---

### 4. `src/routes/ecpayRoutes.js`（新建）

```js
// POST /api/ecpay/notify — ReturnURL 佔位（本地無法接收，僅防 500）
router.post('/notify', (req, res) => {
  res.type('text').send('1|OK');
});
```

---

### 5. `app.js`

在 `/api/orders` 路由前加入：

```js
app.use('/api/ecpay', require('./src/routes/ecpayRoutes'));
```

（此路由無需 authMiddleware）

---

### 6. `public/js/pages/checkout.js`

修改 `submitOrder()`：

```js
// 1. POST /api/orders（現有邏輯）
const res = await apiFetch('/api/orders', { method: 'POST', body: ... });
const orderId = res.data.id;

// 2. 取 ECPay 表單參數
const formRes = await apiFetch('/api/orders/' + orderId + '/ecpay-params');
const { action, params } = formRes.data;

// 3. 動態建立 form 並 submit
const form = document.createElement('form');
form.method = 'POST';
form.action = action;
Object.entries(params).forEach(([k, v]) => {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = k;
  input.value = v;
  form.appendChild(input);
});
document.body.appendChild(form);
form.submit();
```

---

### 7. `views/pages/order-detail.ejs`

在 Payment Buttons 區塊（`v-if="order.status === 'pending'"`）中，
**以「前往綠界付款」與「確認付款結果」取代現有的模擬按鈕**：

```html
<div v-if="order.status === 'pending'" class="flex gap-4">
  <button @click="goToEcpay" :disabled="loadingEcpay" class="...">
    {{ loadingEcpay ? '載入中...' : '前往綠界付款' }}
  </button>
  <button @click="verifyPayment" :disabled="verifying" class="...">
    {{ verifying ? '查詢中...' : '確認付款結果' }}
  </button>
</div>
```

paymentResult 資料屬性已存在，可透過 URL `?payment=done` 自動顯示提示訊息。

---

### 8. `public/js/pages/order-detail.js`

新增兩個函式：

**`goToEcpay()`**：
- 呼叫 `GET /api/orders/:id/ecpay-params`
- 動態建立 form 並 submit（同 checkout.js 邏輯）

**`verifyPayment()`**：
- 呼叫 `POST /api/orders/:id/verify-payment`
- 更新 `order.value` 為回傳結果
- 顯示通知：付款成功 / 付款失敗 / 尚未付款

移除原有 `simulatePay`、`handlePaySuccess`、`handlePayFail`（保留向後相容視需求）。

---

## 驗證方式

1. 啟動伺服器：`npm start`
2. 登入 → 加入商品至購物車 → 前往結帳
3. 填寫收件資訊 → 點「確認送出訂單」
4. 自動跳轉至綠界付款頁（信用卡付款）
5. 輸入測試卡號 `4311-9522-2222-2222`，CVV `222`，3DS `1234`
6. 付款完成後被導回訂單詳情頁（URL 含 `?payment=done`）
7. 點「確認付款結果」→ 訂單狀態更新為「已付款」

**QueryTradeInfo 回傳值**：
- `TradeStatus=1` → status 更新為 `paid`
- `TradeStatus=0` → 維持 `pending`（尚未付款）
- 其他 → status 更新為 `failed`

---

## 新增依賴

**無需新增 npm 套件**，使用 Node.js 內建 `https` + `crypto` 模組。

---

## 文件更新

- `docs/plans/` → 完成後移至 `docs/plans/archive/`
- `docs/FEATURES.md` → 新增 ECPay 金流串接功能
- `docs/CHANGELOG.md` → 記錄版本變更
