/**
 * telegram/telegramBridge.js
 *
 * الطبقة الوحيدة في المشروع اللي بتتكلم مع تليجرام فعليًا (I/O Layer).
 * بتستخدم مكتبة gramjs بحساب المستخدم الشخصي بتاعك (مش بوت)، عشان تقدر
 * تقرا رسايل قنوات إنت مشترك فيها بس، زي ما موضّح في بند 1 من الوثيقة.
 *
 * ملحوظة مهمة: الملف ده لازم يتشغّل على السيرفر (VPS) بتاعك مباشرة،
 * مش هنا في المحادثة، لأن الشبكة هنا معندهاش وصول لسيرفرات تليجرام.
 * كل اللي بنعمله هنا هو كتابة الكود جاهز ومُختبر منطقيًا (عن طريق
 * messageRouter.js اللي هو الجزء المُختبر فعليًا)، وهسيب لك خطوات
 * التشغيل الفعلي لما نوصل لمرحلة الرفع على السيرفر.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { EditedMessage } = require('telegram/events/EditedMessage');

class TelegramBridge {
  /**
   * @param {object} config
   * @param {number} config.apiId - من my.telegram.org (بند "بيانات تُحدد قبل التنفيذ")
   * @param {string} config.apiHash - من my.telegram.org
   * @param {string} config.sessionString - ناتج أول تسجيل دخول (sessionLogin.js) - بيُحفظ ويُعاد استخدامه، مفيش تسجيل دخول متكرر
   * @param {Array<string|number>} config.channels - يوزرات أو IDs القناتين (خاصة وعامة)
   * @param {import('./messageRouter').MessageRouter} config.router
   * @param {(msg: string) => void} [config.onLog] - لتسجيل حالة الاتصال في بند 14 (لوحة الإدارة)
   */
  constructor({ apiId, apiHash, sessionString, channels, router, onLog }) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.sessionString = sessionString;
    this.channels = channels;
    this.router = router;
    this.onLog = onLog || console.log;
    this.client = null;
    this._channelEntities = new Map(); // channelId → entity (لاستخدامها في استرجاع الرسائل الفائتة)
    this._lastSeenPerChannel = new Map(); // channelId → آخر messageId اتقرا، لحساب الفائت عند إعادة الاتصال
  }

  async connect() {
    const session = new StringSession(this.sessionString || '');
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: Infinity, // إعادة محاولة الاتصال تلقائيًا عند الانقطاع (بند 14)
      autoReconnect: true,
    });

    await this.client.connect();
    this.onLog('✅ اتصل بتليجرام بنجاح');

    // تحميل كيانات القنوات مرة واحدة، ومحاولة استرجاع أي رسائل فاتت أثناء التوقف
    for (const channel of this.channels) {
      const entity = await this.client.getEntity(channel);
      this._channelEntities.set(String(entity.id), entity);
      await this._catchUpMissedMessages(entity);
    }

    // رسائل جديدة لحظية
    this.client.addEventHandler(async (event) => {
      const msg = event.message;
      const channelId = String(msg.peerId?.channelId ?? msg.chatId ?? '');
      this._lastSeenPerChannel.set(channelId, msg.id);
      this.router.ingest({
        text: msg.message || '',
        channelId,
        messageId: msg.id,
        timestamp: msg.date * 1000, // gramjs بيدي التوقيت بالثواني
      });
    }, new NewMessage({ chats: this.channels }));

    // رسائل اتعدّلت (بند 9: التعديلات تُطبق فورًا على نفس الإشارة)
    this.client.addEventHandler(async (event) => {
      const msg = event.message;
      const channelId = String(msg.peerId?.channelId ?? msg.chatId ?? '');
      this.router.ingestEdit({
        text: msg.message || '',
        channelId,
        messageId: msg.id,
        timestamp: msg.date * 1000,
      });
    }, new EditedMessage({ chats: this.channels }));

  }

  /**
   * بند 2: "إذا انقطع الاتصال، تُسترجع الرسائل الفائتة حسب وقتها الأصلي"
   * بنجيب آخر الرسائل من القناة من وقت آخر رسالة اتقرت، ونمررهم لـ router.replayMissed
   * اللي بيرتبهم زمنيًا قبل المعالجة.
   */
  async _catchUpMissedMessages(entity) {
    const channelId = String(entity.id);
    const lastSeenId = this._lastSeenPerChannel.get(channelId) || 0;

    const messages = await this.client.getMessages(entity, { limit: 100 });
    const missed = messages
      .filter((m) => m.id > lastSeenId && m.message)
      .map((m) => ({
        text: m.message,
        channelId,
        messageId: m.id,
        timestamp: m.date * 1000,
      }));

    if (missed.length) {
      this.onLog(`↻ استرجاع ${missed.length} رسالة فائتة من القناة ${channelId}`);
      this.router.replayMissed(missed);
      this._lastSeenPerChannel.set(channelId, Math.max(...missed.map((m) => m.messageId)));
    }
  }

  async disconnect() {
    if (this.client) await this.client.disconnect();
  }
}

module.exports = { TelegramBridge };
