/**
 * test/authService.test.js
 * تشغيل: node test/authService.test.js
 */

const { AuthService, hashToken } = require('../auth/authService');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

function makeFakeSubscriberStore(subscribers) {
  return {
    async findByTokenHash(tokenHash) {
      return subscribers.find((s) => s._tokenHash === tokenHash) || null;
    },
    async updateDevices(id, devices) {
      const s = subscribers.find((x) => x._id === id);
      if (s) s.devices = devices;
    },
    async touchLogin(id, date) {
      const s = subscribers.find((x) => x._id === id);
      if (s) s.lastLoginAt = date;
    },
  };
}

(async () => {
  section('AuthService: دخول صحيح لأول مرة');

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const subscribers = [
    {
      _id: 'sub1',
      displayName: 'أحمد',
      subscriptionId: 'sub-uuid-1',
      _tokenHash: hashToken('secret-token-123'),
      active: true,
      expiresAt: futureDate,
      maxDevices: 2,
      devices: [],
    },
  ];

  const auth = new AuthService({ subscriberStore: makeFakeSubscriberStore(subscribers) });

  let r = await auth.login({ accessToken: 'secret-token-123', deviceId: 'tablet-honor-1', deviceLabel: 'تابلت Honor' });
  assert(r.valid === true, 'الدخول نجح بتوكن صحيح');
  assert(subscribers[0].devices.length === 1, 'الجهاز الأول اتسجل');

  section('AuthService: رفض توكن خاطئ');
  r = await auth.login({ accessToken: 'wrong-token', deviceId: 'tablet-honor-1' });
  assert(r.valid === false && r.reason === 'INVALID_TOKEN', 'توكن خاطئ اترفض');

  section('AuthService: حد الأجهزة');
  await auth.login({ accessToken: 'secret-token-123', deviceId: 'phone-2' }); // جهاز تاني، لسه تحت الحد (2)
  assert(subscribers[0].devices.length === 2, 'الجهاز التاني اتسجل لأنه لسه تحت الحد');

  r = await auth.login({ accessToken: 'secret-token-123', deviceId: 'laptop-3' }); // جهاز تالت، تجاوز الحد
  assert(r.valid === false && r.reason === 'DEVICE_LIMIT_REACHED', 'الجهاز الثالث اترفض (تجاوز الحد)');

  r = await auth.login({ accessToken: 'secret-token-123', deviceId: 'tablet-honor-1' }); // جهاز معروف بالفعل
  assert(r.valid === true, 'إعادة دخول من جهاز مسجل قبل كده تنجح حتى لو الحد وصل');

  section('AuthService: مشترك متوقف');
  subscribers[0].active = false;
  r = await auth.login({ accessToken: 'secret-token-123', deviceId: 'tablet-honor-1' });
  assert(r.valid === false && r.reason === 'SUBSCRIBER_DISABLED', 'مشترك متوقف اترفض فورًا');
  subscribers[0].active = true;

  section('AuthService: اشتراك منتهي');
  subscribers[0].expiresAt = new Date(Date.now() - 1000);
  r = await auth.login({ accessToken: 'secret-token-123', deviceId: 'tablet-honor-1' });
  assert(r.valid === false && r.reason === 'SUBSCRIPTION_EXPIRED', 'اشتراك منتهي اترفض تلقائيًا');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`النتيجة: ${passed} نجح، ${failed} فشل`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
})();
