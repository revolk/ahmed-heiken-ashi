/**
 * telegram/sessionLogin.js
 *
 * يتشغّل مرة واحدة بس (يدويًا) على السيرفر، عشان تسجّل دخول حسابك الشخصي
 * على تليجرام وتولّد "session string" — بعدها البوت هيستخدم الجلسة دي
 * للاتصال تلقائيًا من غير ما يطلب كود تسجيل دخول تاني أبدًا.
 *
 * الاستخدام (على السيرفر، مش هنا):
 *   node telegram/sessionLogin.js
 *
 * هيطلب منك:
 *   1) API_ID و API_HASH (تجيبهم مجانًا من my.telegram.org)
 *   2) رقم تليفونك
 *   3) كود التفعيل اللي هيوصلك على تليجرام
 *
 * وفي الآخر هيطبعلك الـ session string — تحطه في ملف .env تحت اسم
 * TELEGRAM_SESSION، ومتشاركهوش مع حد لأنه بيدي دخول كامل لحسابك.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // مكتبة صغيرة لقراءة إدخال المستخدم من الـ terminal

(async () => {
  console.log('== تسجيل الدخول لحساب تليجرام (مرة واحدة بس) ==');

  const apiId = parseInt(await input.text('API_ID: '), 10);
  const apiHash = await input.text('API_HASH: ');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('رقم تليفونك (بالصيغة الدولية +20...): '),
    password: async () => await input.text('كلمة مرور التحقق بخطوتين (لو مفعّلة، وإلا اضغط Enter): '),
    phoneCode: async () => await input.text('الكود اللي وصلك على تليجرام: '),
    onError: (err) => console.error(err),
  });

  console.log('\n✅ تم تسجيل الدخول بنجاح.\n');
  console.log('انسخ الـ session string ده وحطه في .env باسم TELEGRAM_SESSION:\n');
  console.log(client.session.save());

  await client.disconnect();
})();
