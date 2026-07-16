/**
 * api/server.js
 * سيرفر الـ API الرئيسي (Express) - بيجمع مسارات الدخول ولوحة الإدارة،
 * وبيقدّم الواجهة المبنية (dashboard/dist) كملفات ثابتة من نفس العملية،
 * عشان الملف التنفيذي النهائي يكون عملية واحدة بس (سيرفر + واجهة).
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const { createAuthRouter } = require('./authRoutes');
const { createAdminRouter } = require('./adminRoutes');

function createApiServer({ adminSecret, onLog }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', createAuthRouter({ onLog }));
  app.use('/admin', createAdminRouter({ adminSecret }));

  const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
  if (fs.existsSync(dashboardDist)) {
    app.use(express.static(dashboardDist));
    app.get(/^(?!\/(auth|admin|health)).*/, (_req, res) => {
      res.sendFile(path.join(dashboardDist, 'index.html'));
    });
  } else {
    (onLog || console.log)('⚠️ لا توجد نسخة مبنية من الواجهة (dashboard/dist) - شغّل npm run build جوه dashboard/');
  }

  app.use((err, _req, res, _next) => {
    (onLog || console.error)(`❌ خطأ في API: ${err.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
}

module.exports = { createApiServer };
