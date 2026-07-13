/**
 * api/server.js
 * سيرفر الـ API الرئيسي (Express) - بيجمع مسارات الدخول ولوحة الإدارة.
 * ده منفصل عن priceFeedServer.js (اللي بيشتغل بـ WebSocket خام لأداء أعلى للتيكات اللحظية).
 */

const express = require('express');
const { createAuthRouter } = require('./authRoutes');
const { createAdminRouter } = require('./adminRoutes');

function createApiServer({ adminSecret, onLog }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', createAuthRouter({ onLog }));
  app.use('/admin', createAdminRouter({ adminSecret }));

  // معالج أخطاء عام - عشان أي خطأ غير متوقع يرجع رسالة واضحة بدل ما يوقف السيرفر
  app.use((err, _req, res, _next) => {
    (onLog || console.error)(`❌ خطأ في API: ${err.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
}

module.exports = { createApiServer };
