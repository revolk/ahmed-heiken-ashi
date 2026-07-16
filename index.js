/**
 * index.js
 * نقطة التشغيل الرئيسية للمشروع بالكامل. بتجمع:
 * تليجرام ⇄ محرك الحالة ⇄ قاعدة البيانات ⇄ سعر MT5 ⇄ API المشتركين
 *
 * التشغيل: node index.js
 */

require('dotenv').config();

const { connectDB } = require('./db/connect');
const { TradeStateMachine } = require('./engine/tradeStateMachine');
const { PersistenceLayer } = require('./persistence/persistenceLayer');
const { mongoTradeStore } = require('./persistence/mongoTradeStore');
const { MessageRouter } = require('./telegram/messageRouter');
const { TelegramBridge } = require('./telegram/telegramBridge');
const { PriceFeedServer } = require('./priceFeed/priceFeedServer');
const { createApiServer } = require('./api/server');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ متغير البيئة ${name} مفقود في ملف .env - راجع .env.example`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

  await connectDB(requiredEnv('MONGO_URI'), { onLog: log });

  const persistence = new PersistenceLayer({ tradeStore: mongoTradeStore, onLog: log });

  let priceFeedServer;

  const stateMachine = new TradeStateMachine({
    getMarketPrice: () => priceFeedServer?.tickIngestor?.lastPrice ?? null,
  });

  const router = new MessageRouter({
    stateMachine,
    onResult: (result) => {
      if (result.commands?.length) persistence.applyCommands(result.commands);
    },
  });

  const telegramBridge = new TelegramBridge({
    apiId: parseInt(requiredEnv('TELEGRAM_API_ID'), 10),
    apiHash: requiredEnv('TELEGRAM_API_HASH'),
    sessionString: requiredEnv('TELEGRAM_SESSION'),
    channels: requiredEnv('TELEGRAM_CHANNELS').split(',').map((c) => c.trim()),
    router,
    onLog: log,
  });

  priceFeedServer = new PriceFeedServer({
    port: parseInt(process.env.PRICEFEED_PORT || '8081', 10),
    ingestSecret: requiredEnv('PRICEFEED_INGEST_SECRET'),
    stateMachine,
    persistence,
    onLog: log,
  });

  const apiApp = createApiServer({ adminSecret: requiredEnv('ADMIN_SECRET'), onLog: log });
  const apiPort = parseInt(process.env.API_PORT || '3000', 10);

  await telegramBridge.connect();
  priceFeedServer.start();
  apiApp.listen(apiPort, () => {
    log(`✅ سيرفر الـ API شغال على المنفذ ${apiPort}`);
    if (process.env.AUTO_OPEN_BROWSER !== 'false') {
      require('open')(`http://localhost:${apiPort}`).catch(() => {
        log('⚠️ تعذّر فتح المتصفح تلقائيًا - افتحه يدويًا على العنوان اللي فوق');
      });
    }
  });

  log('🚀 المشروع شغال بالكامل');

  process.on('SIGINT', async () => {
    log('⏹️ جاري إيقاف المشروع...');
    await telegramBridge.disconnect();
    priceFeedServer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌ فشل تشغيل المشروع:', err);
  process.exit(1);
});
