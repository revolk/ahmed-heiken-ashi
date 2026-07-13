/**
 * api/authRoutes.js
 * مسار دخول المشترك العادي (بند 13) - يُستخدم من تطبيق/صفحة الدخول
 * قبل ما يفتح اتصال WebSocket لقناة "subscribe" في priceFeedServer.js.
 */

const express = require('express');
const { AuthService } = require('../auth/authService');
const { mongoSubscriberStore } = require('../auth/mongoSubscriberStore');

function createAuthRouter({ onLog } = {}) {
  const router = express.Router();
  const authService = new AuthService({ subscriberStore: mongoSubscriberStore, onLog });

  router.post('/login', async (req, res) => {
    const { accessToken, deviceId, deviceLabel } = req.body;
    const result = await authService.login({ accessToken, deviceId, deviceLabel });

    if (!result.valid) {
      const statusMap = {
        MISSING_CREDENTIALS: 400,
        INVALID_TOKEN: 401,
        SUBSCRIBER_DISABLED: 403,
        SUBSCRIPTION_EXPIRED: 403,
        DEVICE_LIMIT_REACHED: 403,
      };
      return res.status(statusMap[result.reason] || 401).json({ error: result.reason });
    }

    res.json({ subscriber: result.subscriber });
  });

  return router;
}

module.exports = { createAuthRouter };
