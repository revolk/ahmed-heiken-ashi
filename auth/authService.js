/**
 * auth/authService.js
 *
 * منطق صافٍ (بدون Express أو Mongoose مباشرة) للتحقق من صلاحية مشترك - بند 13:
 * - تصريح منفصل لكل مستخدم (Access Token شخصي، مفيش كلمة سر مشتركة)
 * - تحديد عدد الأجهزة، ورفض أي جهاز زيادة عن الحد
 * - تسجيل آخر دخول
 * - رفض فوري لو المشترك متوقف أو الاشتراك منتهي
 *
 * @typedef {object} SubscriberStore
 * @property {(tokenHash: string) => Promise<object|null>} findByTokenHash
 * @property {(id: string, devices: object[]) => Promise<void>} updateDevices
 * @property {(id: string, date: Date) => Promise<void>} touchLogin
 */

const crypto = require('crypto');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

class AuthService {
  /** @param {{ subscriberStore: SubscriberStore, onLog?: Function }} deps */
  constructor({ subscriberStore, onLog }) {
    if (!subscriberStore) throw new Error('AuthService: subscriberStore مطلوب');
    this.subscriberStore = subscriberStore;
    this.onLog = onLog || (() => {});
  }

  /**
   * @param {object} params - { accessToken, deviceId, deviceLabel }
   * @returns {Promise<{valid:true, subscriber:object}|{valid:false, reason:string}>}
   */
  async login({ accessToken, deviceId, deviceLabel }) {
    if (!accessToken || !deviceId) {
      return { valid: false, reason: 'MISSING_CREDENTIALS' };
    }

    const subscriber = await this.subscriberStore.findByTokenHash(hashToken(accessToken));
    if (!subscriber) {
      return { valid: false, reason: 'INVALID_TOKEN' };
    }

    if (!subscriber.active) {
      return { valid: false, reason: 'SUBSCRIBER_DISABLED' };
    }

    if (new Date(subscriber.expiresAt) <= new Date()) {
      return { valid: false, reason: 'SUBSCRIPTION_EXPIRED' };
    }

    const devices = subscriber.devices || [];
    const existingDevice = devices.find((d) => d.deviceId === deviceId);
    const now = new Date();

    if (existingDevice) {
      existingDevice.lastSeenAt = now;
    } else {
      if (devices.length >= subscriber.maxDevices) {
        this.onLog(`⛔ محاولة دخول مرفوضة (تجاوز حد الأجهزة): ${subscriber.displayName}`);
        return { valid: false, reason: 'DEVICE_LIMIT_REACHED' };
      }
      devices.push({ deviceId, label: deviceLabel || 'جهاز غير معروف', firstSeenAt: now, lastSeenAt: now });
    }

    await this.subscriberStore.updateDevices(subscriber._id, devices);
    await this.subscriberStore.touchLogin(subscriber._id, now);

    this.onLog(`✅ دخول ناجح: ${subscriber.displayName}`);

    return {
      valid: true,
      subscriber: {
        id: subscriber._id,
        displayName: subscriber.displayName,
        subscriptionId: subscriber.subscriptionId,
      },
    };
  }
}

module.exports = { AuthService, hashToken };
