/**
 * test/tickIngestor.test.js
 * تشغيل: node test/tickIngestor.test.js
 */

const { TradeStateMachine } = require('../engine/tradeStateMachine');
const { parseMessage } = require('../parser/signalParser');
const { PersistenceLayer } = require('../persistence/persistenceLayer');
const { TickIngestor } = require('../priceFeed/tickIngestor');

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
    async create(trade) { const id = String(nextId++); db.set(id, { ...trade, _id: id }); return id; },
    async update(id, trade) { db.set(id, { ...db.get(id), ...trade, _id: id }); },
    async archive(id, trade) { db.set(id, { ...db.get(id), ...trade, _id: id, closedAt: new Date() }); },
  };
}

(async () => {
  section('TickIngestor: رفض بيانات فاسدة من الجسر');

  const sm0 = new TradeStateMachine({ getMarketPrice: () => 3363 });
  const ingestor0 = new TickIngestor({ stateMachine: sm0 });

  let r = await ingestor0.handleTick({ price: -5, timestamp: Date.now() });
  assert(r.rejected && r.reason === 'INVALID_PRICE', 'سعر سالب اترفض');

  r = await ingestor0.handleTick({ price: 'not a number', timestamp: Date.now() });
  assert(r.rejected, 'سعر مش رقم اترفض');

  r = await ingestor0.handleTick({ price: 3363, timestamp: Date.now() });
  assert(!r.rejected, 'أول تيك صحيح اتقبل');

  r = await ingestor0.handleTick({ price: 5000, timestamp: Date.now() }); // قفزة أكبر من 5%
  assert(r.rejected && r.reason === 'SUSPICIOUS_PRICE_JUMP', 'قفزة سعر غير منطقية اترفضت (حماية بيانات فاسدة)');

  section('TickIngestor: تيك يوصل TP1 ويتحفظ ويتبث للمشتركين');

  const store = makeFakeStore();
  const persistence = new PersistenceLayer({ tradeStore: store });
  const sm = new TradeStateMachine({ getMarketPrice: () => 3372 });
  const entryResult = sm.handleEvent(parseMessage('BUY NOW XAUUSD من 3363 الى 3365 SL 3358 TP1 3370'));
  await persistence.applyCommands(entryResult.commands); // لازم نحفظ الدخول الأولي زي ما بيحصل فعليًا في الإنتاج

  const broadcasted = [];
  const ingestor = new TickIngestor({
    stateMachine: sm,
    persistence,
    onBroadcast: (payload) => broadcasted.push(payload),
  });

  await ingestor.handleTick({ price: 3365, timestamp: Date.now() }); // لسه ماوصلش TP1
  assert(broadcasted.length === 0, 'مفيش بث لتيكات عادية من غير حدث (تقليل الضوضاء)');

  await ingestor.handleTick({ price: 3370, timestamp: Date.now() }); // وصل TP1
  assert(broadcasted.length === 1, 'حصل بث واحد لحظة TP1');
  assert(broadcasted[0].badges.some((b) => b.includes('TP1 HIT')), 'شارة TP1 HIT وصلت في البث');
  assert([...store.db.values()][0].status === 'TP1_HIT', 'الحالة اتحفظت في القاعدة فورًا (بند 14)');

  section('TickIngestor: رصد تجمّد مصدر السعر');

  const logs = [];
  const ingestor2 = new TickIngestor({
    stateMachine: new TradeStateMachine({}),
    onLog: (msg) => logs.push(msg),
    staleAfterMs: 5000,
  });

  const t0 = Date.now();
  await ingestor2.handleTick({ price: 3363, timestamp: t0 });
  assert(ingestor2.checkStale(t0 + 2000) === false, 'لسه مش متجمد بعد ثانيتين');
  assert(ingestor2.checkStale(t0 + 6000) === true, 'اتجمد بعد 6 ثواني (أكبر من الحد 5 ثواني)');
  assert(logs.some((l) => l.includes('تجمّد') === false && l.includes('مفيش سعر جديد')), 'تنبيه التجمّد اتسجل في اللوج');

  await ingestor2.handleTick({ price: 3363, timestamp: t0 + 6500 });
  assert(logs.some((l) => l.includes('رجع يشتغل')), 'تنبيه رجوع المصدر اتسجل بعد وصول تيك جديد');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`النتيجة: ${passed} نجح، ${failed} فشل`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
})();
