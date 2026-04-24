# CHANGELOG.md

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## [1.0.0] - 2026-04-22

### Added
- 使用者認證：註冊（POST /api/auth/register）、登入（POST /api/auth/login）、個人資料（GET /api/auth/profile）
- 商品瀏覽：列表（分頁）、詳情（GET /api/products, GET /api/products/:id）
- 購物車：雙模式認證（JWT + X-Session-Id），CRUD 操作，累加邏輯，庫存驗證
- 訂單：Transaction 原子建立（扣庫存 + 清購物車），列表，詳情，模擬付款（success/fail）
- 後台商品管理：列表、新增、編輯（partial update）、刪除（含 pending 訂單保護）
- 後台訂單查閱：列表（status 篩選）、詳情（含 user 資訊）
- EJS 前台頁面：首頁、商品詳情、購物車、結帳、登入、訂單列表、訂單詳情
- EJS 後台頁面：商品管理、訂單管理
- SQLite 資料庫：WAL 模式，5 張資料表（users/products/cart_items/orders/order_items），8 筆種子商品，管理員種子帳號
- Tailwind CSS 4.x 整合（CLI 建置）
- Vitest + Supertest 測試套件（6 個測試檔，固定執行順序）
- swagger-jsdoc OpenAPI 3.0 文件產生
