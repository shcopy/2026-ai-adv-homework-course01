const express = require('express');

const router = express.Router();

// ReturnURL 佔位 — 本地無法接收 ECPay Server-to-Server callback，僅防 500
router.post('/notify', (req, res) => {
  res.type('text').send('1|OK');
});

module.exports = router;
