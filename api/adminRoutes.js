/**
 * api/adminRoutes.js
 * لوحة إدارة المشتركين (بند 13): إضافة، تحديد المدة وعدد الأجهزة، إيقاف، حذف.
 * كل المسارات هنا محمية بمفتاح إداري منفصل تمامًا عن توكنات المشتركين.
 */

const express = require('express');
const crypto = require('crypto');
const Subscriber = require('../models/Subscriber');
const { hashToken } = require('../auth/authService');

function adminAuthGuard(adminSecret) {
  return (req, res, next) => {
    const provided = req.headers['x-admin-secret'];
    if (provided !== adminSecret) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    next();
  };
}

function createAdminRouter({ adminSecret }) {
  const router = express.Router();
  router.use(adminAuthGuard(adminSecret));

  // إضافة مشترك جديد - بيرجع الـ accessToken الخام مرة واحدة بس (مش بيتحفظ نص صريح أبدًا)
  router.post('/subscribers', async (req, res) => {
    const { displayName, maxDevices = 1, durationDays = 30, notes } = req.body;
    if (!displayName) return res.status(400).json({ error: 'displayName مطلوب' });

    const rawToken = crypto.randomBytes(24).toString('hex');
    const subscriber = await Subscriber.create({
      displayName,
      accessToken: hashToken(rawToken),
      maxDevices,
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      notes,
    });

    res.status(201).json({
      subscriptionId: subscriber.subscriptionId,
      displayName: subscriber.displayName,
      accessToken: rawToken, // آخر مرة يظهر فيها بشكل صريح - المفروض تتبعت للمشترك دلوقتي وتتقفل
      expiresAt: subscriber.expiresAt,
    });
  });

  // قائمة المشتركين (بدون التوكنات نفسها)
  router.get('/subscribers', async (_req, res) => {
    const subscribers = await Subscriber.find().select('-accessToken').lean();
    res.json(subscribers);
  });

  // إيقاف/تفعيل فوري (بند 13: إيقافه أو حذفه فورًا)
  router.patch('/subscribers/:id/active', async (req, res) => {
    const { active } = req.body;
    await Subscriber.findByIdAndUpdate(req.params.id, { active: !!active });
    res.json({ ok: true });
  });

  // تمديد أو تقصير مدة الاشتراك
  router.patch('/subscribers/:id/expiry', async (req, res) => {
    const { expiresAt } = req.body;
    await Subscriber.findByIdAndUpdate(req.params.id, { expiresAt: new Date(expiresAt) });
    res.json({ ok: true });
  });

  // حذف نهائي
  router.delete('/subscribers/:id', async (req, res) => {
    await Subscriber.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  // فصل جهاز معيّن بدل ما ينتظر حد الأجهزة يتصفر لوحده
  router.delete('/subscribers/:id/devices/:deviceId', async (req, res) => {
    const subscriber = await Subscriber.findById(req.params.id);
    if (!subscriber) return res.status(404).json({ error: 'NOT_FOUND' });
    subscriber.devices = subscriber.devices.filter((d) => d.deviceId !== req.params.deviceId);
    await subscriber.save();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminRouter };
