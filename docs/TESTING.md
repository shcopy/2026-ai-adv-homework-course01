# TESTING.md

## 測試技術棧

- **測試框架**：Vitest 4.x（ESM 設定檔 `vitest.config.js`）
- **HTTP 測試**：Supertest 7.x（直接對 `app` 發請求，不需啟動 HTTP server）
- **資料庫**：共用 `database.sqlite`（非 in-memory），測試前種子資料已存在

## 測試檔案表

| 檔案 | 描述 | 執行順序 |
|------|------|---------|
| `tests/setup.js` | 共用輔助函式（非測試檔，無 `describe`） | — |
| `tests/auth.test.js` | 註冊、登入、個人資料 API | 1 |
| `tests/products.test.js` | 商品列表、詳情、分頁 | 2 |
| `tests/cart.test.js` | 購物車 CRUD（訪客 + 登入模式） | 3 |
| `tests/orders.test.js` | 訂單建立、列表、詳情 | 4 |
| `tests/adminProducts.test.js` | 後台商品 CRUD + 權限驗證 | 5 |
| `tests/adminOrders.test.js` | 後台訂單列表 + 詳情 | 6 |

## 執行順序與依賴關係

**重要**：`vitest.config.js` 設定 `fileParallelism: false`，測試檔按 `sequence.files` 陣列**依序串列**執行，不平行。

```
auth.test.js → products.test.js → cart.test.js → orders.test.js → adminProducts.test.js → adminOrders.test.js
```

**跨測試檔依賴**：

- `cart.test.js`：`beforeAll` 呼叫 `GET /api/products` 取得 `productId`
- `orders.test.js`：`beforeAll` 呼叫 `registerUser()` + `GET /api/products` + `POST /api/cart`，依賴 products 和 cart 已可正常運作
- `adminProducts.test.js`：`beforeAll` 呼叫 `getAdminToken()`，依賴管理員種子帳號已存在
- `adminOrders.test.js`：依賴 orders.test.js 已建立訂單資料（查閱全站訂單）

**測試內資料隔離**：每個測試使用 `registerUser()` 動態建立獨立 email（含 timestamp + random）避免碰撞，但所有測試共用同一個 SQLite 資料庫，測試間無 cleanup/rollback。

## 輔助函式（tests/setup.js）

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

| 函式 | 簽名 | 說明 |
|------|------|------|
| `getAdminToken()` | `async () => string` | 以種子管理員帳號（admin@hexschool.com / 12345678）登入，回傳 JWT |
| `registerUser(overrides?)` | `async (overrides?) => { token, user }` | 動態建立測試帳號，支援 overrides `{ email, password, name }`，預設 email = `test-<timestamp>-<random>@example.com` |
| `app` | Express app | 直接傳給 supertest |
| `request` | supertest | 已 `require('supertest')` 的 supertest 函式 |

## 執行測試

```bash
# 執行全部測試
npm test

# 指定單一檔案（開發中常用）
npx vitest run tests/cart.test.js

# watch 模式（持續執行）
npx vitest tests/cart.test.js
```

## 撰寫新測試步驟

1. 在 `tests/` 下建立 `<feature>.test.js`
2. `require('./setup')` 取得 `{ app, request, getAdminToken, registerUser }`
3. 在 `vitest.config.js` 的 `sequence.files` 加入新檔案（注意順序，有依賴關係的放後面）
4. 遵循統一的斷言模式（見下方範例）

**新測試範例**
```javascript
const { app, request, registerUser } = require('./setup');

describe('Example API', () => {
  let userToken;

  beforeAll(async () => {
    const { token } = await registerUser();
    userToken = token;
  });

  it('should do something', async () => {
    const res = await request(app)
      .get('/api/example')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/example');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
```

## 常見陷阱

1. **bcrypt 在測試環境很慢**：`src/database.js` 的 `seedAdminUser()` 已處理（`NODE_ENV === 'test'` 時使用 1 round），但 `registerUser()` 呼叫 `POST /api/auth/register` 仍走 10 rounds bcrypt，在大量呼叫時會顯著拖慢測試速度。避免在迴圈中大量呼叫 `registerUser()`。

2. **共用資料庫，無測試隔離**：所有測試操作都寫入真實的 `database.sqlite`。若測試中建立的資料影響後續測試，需在 `beforeAll`/`afterAll` 自行清理，或設計測試讓資料不衝突（如 `orders.test.js` 的購物車操作會清空購物車）。

3. **`sequence.files` 順序強制依賴**：若要新增測試檔，必須加入 `vitest.config.js`，否則 Vitest 可能不按預期順序執行，導致 `beforeAll` 取得的資料缺失。

4. **Session ID 測試隔離**：`cart.test.js` 使用 `const sessionId = 'test-session-' + Date.now()` 確保每次執行使用不同 session，但舊資料會殘留在 DB。若測試多次執行，同一 timestamp 的 session 可能有遺留項目。

5. **訂單付款狀態不可逆**：`PATCH /api/orders/:id/pay` 只能對 `pending` 訂單操作。若測試中已付款，後續無法再測試付款流程，需重新建立訂單。
