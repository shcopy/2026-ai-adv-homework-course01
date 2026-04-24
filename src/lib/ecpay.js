const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const HASH_KEY = process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6';
const HASH_IV  = process.env.ECPAY_HASH_IV  || 'EkRm7iFT261dpevs';
const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '3002607';
const IS_STAGING = (process.env.ECPAY_ENV || 'staging') !== 'production';

const BASE_DOMAIN = IS_STAGING
  ? 'payment-stage.ecpay.com.tw'
  : 'payment.ecpay.com.tw';

const AIO_URL    = `https://${BASE_DOMAIN}/Cashier/AioCheckOut/V5`;
const QUERY_URL  = `https://${BASE_DOMAIN}/Cashier/QueryTradeInfo/V5`;

// ECPay 專用 URL encode（對應 PHP SDK UrlService::ecpayUrlEncode）
function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const replacements = { '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!', '%2a': '*', '%28': '(', '%29': ')' };
  for (const [old, ch] of Object.entries(replacements)) {
    encoded = encoded.split(old).join(ch);
  }
  return encoded;
}

function generateCheckMacValue(params) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const sorted = Object.keys(filtered)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = sorted.map(k => `${k}=${filtered[k]}`).join('&');
  const raw = `HashKey=${HASH_KEY}&${paramStr}&HashIV=${HASH_IV}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

// 組 AIO 建單表單參數
function buildAioParams(order, items, returnUrl, clientBackUrl, choosePayment = 'ALL') {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const rawItemName = items.map(i => i.product_name).join('#');
  const itemName = rawItemName.length > 200 ? rawItemName.slice(0, 200) : rawItemName;

  const params = {
    MerchantID:        MERCHANT_ID,
    MerchantTradeNo:   order.merchant_trade_no,
    MerchantTradeDate: tradeDate,
    PaymentType:       'aio',
    TotalAmount:       String(order.total_amount),
    TradeDesc:         '花店訂單',
    ItemName:          itemName,
    ReturnURL:         returnUrl,
    ChoosePayment:     choosePayment,
    EncryptType:       '1',
    ClientBackURL:     clientBackUrl,
  };

  params.CheckMacValue = generateCheckMacValue(params);
  return { action: AIO_URL, params };
}

// 主動向 ECPay 查詢訂單狀態
function queryTradeInfo(merchantTradeNo) {
  return new Promise((resolve, reject) => {
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const queryParams = {
      MerchantID:      MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp:       timeStamp,
    };
    queryParams.CheckMacValue = generateCheckMacValue(queryParams);

    const body = querystring.stringify(queryParams);

    const options = {
      hostname: BASE_DOMAIN,
      path:     '/Cashier/QueryTradeInfo/V5',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const result = querystring.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error('ECPay 回應解析失敗: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { generateCheckMacValue, buildAioParams, queryTradeInfo, AIO_URL, QUERY_URL };
