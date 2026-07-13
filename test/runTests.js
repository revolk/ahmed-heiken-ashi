/**
 * test/runTests.js
 * تشغيل: node test/runTests.js
 * اختبار يدوي بسيط (بدون مكتبة خارجية) عشان نتأكد إن المنطق شغال صح
 * على أمثلة واقعية قريبة من أسلوب قنوات التوصيات.
 */

const { parseMessage } = require('../parser/signalParser');
const { TradeStateMachine } = require('../engine/tradeStateMachine');

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

// ---------- اختبار الـ Parser ----------

section('Parser: تصنيف الرسائل');

let ev = parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370 TP2 3375 TP3 3380');
assert(ev.type === 'ENTRY', 'BUY NOW مع منطقة دخول يُصنّف ENTRY');
assert(ev.direction === 'BUY', 'الاتجاه BUY صحيح');
assert(ev.referencePrice === 3363, 'السعر المرجعي لـ BUY = أقل سعر في المنطقة (بند 4)');
assert(ev.sl === 3358 && ev.tp1 === 3370 && ev.tp2 === 3375 && ev.tp3 === 3380, 'SL/TP1/TP2/TP3 استُخرجوا صح');

ev = parseMessage('SELL NOW GOLD from 3365 to 3363 SL 3370 TP1 3355');
assert(ev.type === 'ENTRY' && ev.direction === 'SELL', 'SELL NOW يُصنّف صح');
assert(ev.referencePrice === 3365, 'السعر المرجعي لـ SELL = أعلى سعر في المنطقة (بند 4)');

ev = parseMessage('استعد لصفقة شراء ذهب قريبا');
assert(ev.type === 'PREPARE' && ev.direction === 'BUY', 'رسالة استعد تُصنّف PREPARE ولا تبدأ صفقة');

ev = parseMessage('نتوقع ارتفاع الذهب اليوم بسبب بيانات التضخم الامريكية');
assert(ev.type === 'NOISE', 'رسالة تحليل عام تُصنّف NOISE (بند 2)');

ev = parseMessage('CONTINUE TO TP2');
assert(ev.type === 'CONTINUE' && ev.target === 'TP2', 'رسالة استمرار تُصنّف صح');

ev = parseMessage('BREAK EVEN + حجز 50% من الأرباح');
assert(ev.type === 'BREAK_EVEN_SECURE' && ev.breakEven && ev.secureProfit, 'رسالة مركبة (بريك ايفن + حجز) تُصنّف صح (بند 8)');

ev = parseMessage('TP1 HIT تحقق الهدف الاول');
assert(ev.type === 'PROVIDER_HIT' && ev.target === 'TP1', 'إعلان تحقق هدف من صاحب القناة يُصنّف صح');

ev = parseMessage('CLOSE NOW عند 3372');
assert(ev.type === 'CLOSE_NOW' && ev.mentionedPrice === 3372, 'إغلاق بسعر مذكور صراحة');

ev = parseMessage('الصفقة ملغاة الشروط لم تتحقق');
assert(ev.type === 'CANCELLED', 'رسالة إلغاء تُصنّف صح');

// ---------- اختبار الـ State Machine ----------

section('State Machine: دورة حياة صفقة كاملة (دخول → TP1 → استمرار → TP2)');

let sm = new TradeStateMachine({ getMarketPrice: () => 3372 });

let r = sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370 TP2 3375'));
assert(sm.activeTrade && sm.activeTrade.status === 'ACTIVE', 'الصفقة بقت فعالة فور BUY NOW (بند 4)');
assert(r.badges.includes('BUY NOW'), 'ظهرت شارة BUY NOW');

r = sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370'));
assert(r.ignored && r.reason === 'DUPLICATE', 'تكرار نفس التوصية تم تجاهله (بند 3)');

r = sm.onPriceTick(3370, Date.now());
assert(sm.activeTrade.status === 'TP1_HIT', 'TP1 اتسجل تلقائيًا من رصد السعر (بند 6)');
assert(r.badges.some((b) => b.includes('TP1 HIT')), 'شارة TP1 HIT ظهرت');

r = sm.handleEvent(parseMessage('CONTINUE TO TP2'));
assert(sm.activeTrade.activeTarget === 'TP2' && sm.activeTrade.status === 'ACTIVE', 'الانتقال لـ TP2 حصل فقط بعد CONTINUE صريح (بند 7)');

r = sm.onPriceTick(3375, Date.now());
assert(sm.activeTrade === null, 'الصفقة اتقفلت وبقت تاريخية بعد TP2 (مفيش استمرار تاني)');
assert(sm.history.length === 1, 'الصفقة اتسجلت في التاريخ');
assert(sm.history[0].status === 'TP2_HIT', 'الحالة النهائية المحفوظة = TP2_HIT');

section('State Machine: توصية معاكسة أثناء صفقة فعالة (بند 3)');

sm = new TradeStateMachine({ getMarketPrice: () => 3358 });
sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370'));
r = sm.handleEvent(parseMessage('SELL NOW XAUUSD من 3370 الى 3372 SL 3376 TP1 3360'));
assert(sm.pendingOpposite !== null, 'التوصية المعاكسة اتحفظت مؤقتًا ومظهرتش (بند 3)');
assert(sm.activeTrade.direction === 'BUY', 'الصفقة الفعالة لسه BUY');

r = sm.onPriceTick(3358, Date.now()); // SL hit
assert(sm.activeTrade !== null && sm.activeTrade.direction === 'SELL', 'بعد SL، التوصية المعاكسة المحفوظة ظهرت فورًا كصفقة فعالة');
assert(sm.pendingOpposite === null, 'الطابور اتفضى بعد الترقية');

section('State Machine: Break Even + Secure Profits (بند 8)');

sm = new TradeStateMachine({ getMarketPrice: () => 3372 });
sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370'));
r = sm.handleEvent(parseMessage('BREAK EVEN + 50% PROFIT SECURED عند 3372'));
assert(sm.activeTrade.breakEvenActivated === true, 'بريك ايفن اتفعّل');
assert(sm.activeTrade.secureProfit === true && sm.activeTrade.securePercent === 50, 'نسبة الحجز الافتراضية 50%');

r = sm.onPriceTick(3363, Date.now()); // رجوع للمرجع = التأمين
assert(sm.activeTrade === null, 'الصفقة اتقفلت عند BREAK EVEN HIT');
assert(sm.history[sm.history.length - 1].status === 'BREAK_EVEN_HIT', 'الحالة النهائية = BREAK_EVEN_HIT');

// ---------- النتيجة النهائية ----------

console.log(`\n${'='.repeat(40)}`);
console.log(`النتيجة: ${passed} نجح، ${failed} فشل`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
