/**
 * priceFeed/priceFeedServer.js
 *
 * الطبقة الوحيدة اللي بتفتح اتصال شبكي فعلي لاستقبال الأسعار (I/O Layer)،
 * بنفس فلسفة telegramBridge.js. بتستخدم WebSocket بسيط:
 *
 *   جسر MT5 (Python, على VPS ويندوز صغير) ──[WebSocket]──> السيرفر ده ──[WebSocket]──> المشتركين
 *
 * السيرفر ده بيشتغل ناحيتين:
 * - قناة "ingest" خاصة (بمفتاح سري) يبعتلها جسر MT5 كل Tick.
 * - قناة "broadcast" عامة (بعد التحقق من صلاحية كل مشترك) بتوصّل التحديثات اللحظية للشارت.
 */

const { WebSocketServer } = require('ws');
const { TickIngestor } = require('./tickIngestor');
const { AuthService } = require('../auth/authService');
const { mongoSubscriberStore } = require('../auth/mongoSubscriberStore');

class PriceFeedServer {
  /**
   * @param {object} config
   * @param {number} config.port
   * @param {string} config.ingestSecret - مفتاح سري يشترك فيه جسر MT5 فقط (بند "الملكية والتسليم": مفاتيح ربط خاصة بيك)
   * @param {import('../engine/tradeStateMachine').TradeStateMachine} config.stateMachine
   * @param {import('../persistence/persistenceLayer').PersistenceLayer} [config.persistence]
   * @param {(msg: string) => void} [config.onLog]
   */
  constructor({ port, ingestSecret, stateMachine, persistence, onLog }) {
    this.port = port;
    this.ingestSecret = ingestSecret;
    this.onLog = onLog || console.log;
    this.subscriberSockets = new Set(); // المشتركين المتصلين لعرض الشارت لحظيًا

    this.tickIngestor = new TickIngestor({
      stateMachine,
      persistence,
      onLog: this.onLog,
      onBroadcast: (payload) => this._broadcastToSubscribers(payload),
    });

    this.authService = new AuthService({ subscriberStore: mongoSubscriberStore, onLog: this.onLog });
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (socket, req) => {
      const url = new URL(req.url, `http://localhost:${this.port}`);
      const channel = url.searchParams.get('channel'); // 'ingest' أو 'subscribe'

      if (channel === 'ingest') {
        this._handleIngestConnection(socket, url);
      } else {
        this._handleSubscriberConnection(socket, url);
      }
    });

    // فحص دوري كل ثانية لاكتشاف تجمّد مصدر السعر (بند 14)
    this._staleCheckInterval = setInterval(() => {
      this.tickIngestor.checkStale(Date.now());
    }, 1000);

    this.onLog(`✅ سيرفر الأسعار شغال على المنفذ ${this.port}`);
  }

  _handleIngestConnection(socket, url) {
    const providedSecret = url.searchParams.get('secret');
    if (providedSecret !== this.ingestSecret) {
      this.onLog('⛔ محاولة اتصال بجسر MT5 بمفتاح خاطئ - تم الرفض');
      socket.close(4001, 'unauthorized');
      return;
    }

    this.onLog('✅ جسر MT5 اتصل بنجاح');

    socket.on('message', async (raw) => {
      let tick;
      try {
        tick = JSON.parse(raw.toString());
      } catch {
        return; // رسالة مش JSON صالحة، بنتجاهلها بأمان
      }
      await this.tickIngestor.handleTick({ price: tick.price, timestamp: tick.timestamp });
    });

    socket.on('close', () => this.onLog('⚠️ جسر MT5 قطع الاتصال'));
  }

  async _handleSubscriberConnection(socket, url) {
    // بند 13: كل مشترك بتصريح شخصي منفصل، متحقق منه هنا نفس منطق api/authRoutes.js بالظبط
    // (استخدام نفس AuthService يضمن التزام حد الأجهزة وحالة الاشتراك في كل نقاط الدخول).
    const accessToken = url.searchParams.get('token');
    const deviceId = url.searchParams.get('deviceId');

    const result = await this.authService.login({ accessToken, deviceId });
    if (!result.valid) {
      this.onLog(`⛔ اتصال شارت مرفوض: ${result.reason}`);
      socket.close(4003, result.reason);
      return;
    }

    socket.subscriberId = result.subscriber.id;
    this.subscriberSockets.add(socket);
    socket.on('close', () => this.subscriberSockets.delete(socket));
  }

  _broadcastToSubscribers(payload) {
    const message = JSON.stringify(payload);
    for (const socket of this.subscriberSockets) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }

  stop() {
    clearInterval(this._staleCheckInterval);
    if (this.wss) this.wss.close();
  }
}

module.exports = { PriceFeedServer };
