# دليل التركيب - خطوة بخطوة

مرحبًا بيك! الدليل ده هيوصلك من صفر لحد ما تشوف توصيات قناتك شغالة على
شارتك الخاص. مفيش حاجة صعبة، بس محتاجة صبر شوية في أول مرة.

## اللي محتاجه قبل ما تبدأ

1. **سيرفر (VPS)** يشتغل 24 ساعة — أي مزود زي Hetzner أو Contabo (حوالي 5$ شهريًا)
2. **حساب MongoDB Atlas مجاني** — قاعدة بيانات سحابية (مفيش أي تكلفة)
3. **حساب Telegram** إنت مشترك فيه بالقناة/القنوات اللي عايز تعرض توصياتها
4. **حساب MT5** (ديمو أو حقيقي) لو عايز السعر اللحظي الحقيقي

## الخطوة 1: قاعدة البيانات

1. افتح cloud.mongodb.com واعمل حساب مجاني
2. اعمل Cluster جديد، اختار M0 (FREE)
3. اعمل Database User واحفظ الباسورد
4. من Network Access، اختار Allow Access from Anywhere
5. من Connect، انسخ رابط الاتصال (Connection String)

## الخطوة 2: تليجرام

1. افتح my.telegram.org وسجل دخول برقمك
2. من API development tools، اعمل تطبيق جديد
3. احفظ api_id و api_hash

## الخطوة 3: تركيب المشروع على السيرفر

git clone الرابط اللي هيديهولك البائع
cd ahmed-heiken-ashi
npm install --ignore-scripts
cp .env.example .env

افتح ملف .env واملأ:
- MONGO_URI — رابط قاعدة البيانات من الخطوة 1
- TELEGRAM_API_ID و TELEGRAM_API_HASH — من الخطوة 2
- TELEGRAM_CHANNELS — يوزرات قنواتك (مفصولة بفاصلة)
- PRICEFEED_INGEST_SECRET و ADMIN_SECRET — أي نص عشوائي طويل تخترعه بنفسك

## الخطوة 4: تسجيل دخول تليجرام (مرة واحدة بس)

npm run login

هيطلب api_id وapi_hash ورقم تليفونك وكود التفعيل اللي هيوصلك. في الآخر
هيديك session طويل — انسخه وحطه في .env تحت TELEGRAM_SESSION.

## الخطوة 5: التشغيل

node index.js

لو شفت "المشروع شغال بالكامل" يبقى تمام.

## الخطوة 6: الواجهة (الشارت)

cd dashboard
npm install
cp .env.example .env.local

عدّل .env.local بـ:
- VITE_INDICATOR_NAME — اسم منتجك اللي هيظهر للمشتركين
- VITE_API_BASE_URL و VITE_PRICEFEED_WS_URL — عنوان سيرفرك

npm run build

## محتاج مساعدة؟

راجع/تواصل مع البائع اللي وفّرلك المشروع.

---
هذا المشروع مرخّص للاستخدام الشخصي/التجاري وفق شروط ملف LICENSE المرفق،
ولا يجوز إعادة توزيعه أو بيعه لطرف ثالث بدون إذن كتابي من صاحب الحقوق.
