/**
 * test/persistenceLayer.test.js
 * تشغيل: node test/persistenceLayer.test.js
 *
 * بيستخدم "fakeTradeStore" في الذاكرة بدل MongoDB حقيقية، عشان نتأكد
 * إن الربط بين أوامر محرك الحالة وعمليات الحفظ (create/update/archive) صحيح 100%
 * قبل ما نوصله بقاعدة بيانات حقيقية على السيرفر.
 */

const { TradeStateMachine } = require('../engine/tradeStateMachine');
const { parseMessage } = require('../parser/signalParser');
const { PersistenceLayer } = require('../persistence/persistenceLayer');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

function makeFakeStore() {
  const db = new Map();
  let nextId = 1;
  return {
    db,
    async create(trade) {
      const id = String(nextId++);
      db.set(id, { ...trade, _id: id });
      return id;
    },
    async update(id, trade) {
      db.set(id, { ...db.get(id), ...trade, _id: id });
    },
    async archive(id, trade) {
      db.set(id, { ...db.get(id), ...trade, _id: id, closedAt: new Date() });
    },
  };
}

(async () => {
  section('PersistenceLayer: صفقة كاملة من الفتح للإغلاق تتحفظ صح');

  const store = makeFakeStore();
  const persistence = new PersistenceLayer({ tradeStore: store });
  const sm = new TradeStateMachine({ getMarketPrice: () => 3372 });

  // ENTRY
  let { commands } = sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370'));
  await persistence.applyCommands(commands);
  assert(store.db.size === 1, 'اتسجلت صفقة واحدة في القاعدة فور الدخول');
  assert([...store.db.values()][0].status === 'ACTIVE', 'الحالة المحفوظة = ACTIVE');

  // MODIFY
  ({ commands } = sm.handleEvent(parseMessage('تعديل SL الى 3355')));
  await persistence.applyCommands(commands);
  assert([...store.db.values()][0].sl === 3355, 'التعديل انحفظ فورًا (بند 14)');

  // TP1 HIT عن طريق تتبع السعر
  ({ commands } = sm.onPriceTick(3370, Date.now()));
  await persistence.applyCommands(commands);
  assert([...store.db.values()][0].status === 'TP1_HIT', 'حالة TP1_HIT انحفظت');

  // CLOSE NOW
  ({ commands } = sm.handleEvent(parseMessage('CONTINUE TO TP2')));
  await persistence.applyCommands(commands);
  ({ commands } = sm.handleEvent(parseMessage('CLOSE NOW عند 3378')));
  await persistence.applyCommands(commands);
  const finalDoc = [...store.db.values()][0];
  assert(finalDoc.status === 'CLOSED_PROFIT', 'الحالة النهائية اتحفظت CLOSED_PROFIT');
  assert(finalDoc.closedAt instanceof Date, 'وقت الإغلاق اتسجل (archive)');
  assert(store.db.size === 1, 'صف واحد بس طول الوقت (اتحدّث مش اتكرر)');

  section('PersistenceLayer: أوامر العرض (SHOW_*, DRAW_CHART_LEVELS) بتتجاهل من طبقة الحفظ');

  const store2 = makeFakeStore();
  const persistence2 = new PersistenceLayer({ tradeStore: store2 });
  await persistence2.applyCommands([
    { action: 'SHOW_TARGET_HIT', points: 70 },
    { action: 'DRAW_CHART_LEVELS', trade: {} },
  ]);
  assert(store2.db.size === 0, 'مفيش حفظ حصل لأوامر مش خاصة بالتخزين');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`النتيجة: ${passed} نجح، ${failed} فشل`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
})();
