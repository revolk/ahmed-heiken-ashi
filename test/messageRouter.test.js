/**
 * test/messageRouter.test.js
 * تشغيل: node test/messageRouter.test.js
 */

const { TradeStateMachine } = require('../engine/tradeStateMachine');
const { MessageRouter } = require('../telegram/messageRouter');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

// ---------- تعديل رسالة عن طريق Edit في تليجرام (بند 9) ----------

section('MessageRouter: تعديل رسالة الدخول عبر Edit بدون كلمة "تعديل"');

let sm = new TradeStateMachine({ getMarketPrice: () => 3372 });
let router = new MessageRouter({ stateMachine: sm });

router.ingest({
  text: 'BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370',
  channelId: 'ch1',
  messageId: 501,
  timestamp: 1000,
});
assert(sm.activeTrade.sl === 3358, 'الستوب الأصلي اتسجل صح');

// صاحب القناة عدّل نفس الرسالة في تليجرام (Edit) وغيّر الستوب، من غير ما يكتب كلمة "تعديل"
router.ingestEdit({
  text: 'BUY NOW XAUUSD من 3363 الى 3365 SL 3355 TP1 3370',
  channelId: 'ch1',
  messageId: 501, // نفس رقم الرسالة
  timestamp: 1050,
});
assert(sm.activeTrade.sl === 3355, 'الـ Edit اتطبّق كتعديل مباشر على نفس الصفقة (بند 9)');

// ---------- منع التكرار عبر القناتين (بند 3) ----------

section('MessageRouter: منع التكرار لو نفس التوصية جت من القناتين');

sm = new TradeStateMachine({ getMarketPrice: () => 3372 });
router = new MessageRouter({ stateMachine: sm });

router.ingest({
  text: 'BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370',
  channelId: 'ch1_private',
  messageId: 1,
  timestamp: 2000,
});
const r2 = router.ingest({
  text: 'BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370',
  channelId: 'ch2_public',
  messageId: 1,
  timestamp: 2003, // وصلت بعد 3 ثواني من القناة التانية
});
assert(r2.ignored === true, 'التوصية المكررة من القناة التانية اتجاهلت');
assert(sm.history.length === 0 && sm.activeTrade !== null, 'صفقة واحدة بس اتفتحت مش اتنين');

// ---------- ترتيب الرسائل الفائتة حسب وقتها الأصلي (بند 2) ----------

section('MessageRouter: استرجاع رسائل فائتة بترتيب غير مرتب زمنيًا');

sm = new TradeStateMachine({ getMarketPrice: () => 3372 });
router = new MessageRouter({ stateMachine: sm });

// الرسائل بتوصل من الشبكة بترتيب عشوائي، لكن الأصل الزمني مختلف
const missed = [
  { text: 'TP1 HIT تحقق الهدف الاول', channelId: 'ch1', messageId: 3, timestamp: 3300 },
  { text: 'BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370', channelId: 'ch1', messageId: 1, timestamp: 3000 },
  { text: 'CONTINUE TO TP2', channelId: 'ch1', messageId: 4, timestamp: 3400 },
];

router.replayMissed(missed);
assert(sm.activeTrade !== null, 'الصفقة اتفتحت بعد إعادة الترتيب الصحيح');
assert(sm.activeTrade.activeTarget === 'TP2', 'الترتيب الزمني الصحيح خلّى TP1 يتسجل الأول ثم CONTINUE (رغم وصولهم بترتيب مختلف)');

console.log(`\n${'='.repeat(40)}`);
console.log(`النتيجة: ${passed} نجح، ${failed} فشل`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
