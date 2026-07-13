/**
 * models/Subscriber.js
 * إدارة المشتركين المصرح لهم (بند 13):
 * - تصريح منفصل لكل مستخدم (مفيش كلمة سر مشتركة)
 * - تحديد المدة وعدد الأجهزة
 * - إيقاف أو حذف فوري
 * - معرفة آخر دخول
 * - علامة مائية إلزامية بمعلومات المشترك
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    label: String, // مثال: "تابلت Honor" أو "لابتوب المكتب"
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: Date,
  },
  { _id: false }
);

const subscriberSchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      required: true,
    }, // يظهر في العلامة المائية على الشارت (بند 13)

    displayName: { type: String, required: true }, // اسم المشترك الظاهر في العلامة المائية

    // بيانات الدخول - تصريح منفصل، لا كلمة سر مشتركة
    accessToken: { type: String, required: true, select: false },

    maxDevices: { type: Number, default: 1 },
    devices: [deviceSchema],

    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true }, // ينتهي الاشتراك تلقائيًا (بند 13)

    lastLoginAt: Date,

    notes: String, // ملاحظات إدارية داخلية (بند 14)
  },
  { timestamps: true }
);

// دالة مساعدة: هل الاشتراك فعّال فعليًا دلوقتي (نشط + لسه في المدة)؟
subscriberSchema.methods.isCurrentlyValid = function () {
  return this.active && this.expiresAt > new Date();
};

module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
