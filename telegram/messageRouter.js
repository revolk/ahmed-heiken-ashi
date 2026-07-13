/**
 * telegram/messageRouter.js
 *
 * طبقة "منطق صافٍ" بين تليجرام والمحرك (تليجرام Bridge ⇄ MessageRouter ⇄ StateMachine).
 * لا تحتوي أي اتصال شبكي، عشان تقدر تُختبر بالكامل بدون تليجرام حقيقي.
 *
 * مسؤولياتها:
 * 1) تحويل رسالة خام لحدث عبر signalParser، وتمريرها لمحرك حالة الصفقة.
 * 2) التعامل مع رسائل "Edit" في تليجرام كتعديل مباشر على نفس التوصية (بند 9)،
 *    حتى لو مفيش كلمة "تعديل" مكتوبة صراحة.
 * 3) ترتيب الرسائل الفائتة (بعد انقطاع الاتصال) حسب وقتها الأصلي قبل معالجتها (بند 2).
 * 4) تسجيل مصدر كل حدث (رقم القناة) للاستخدام لاحقًا في تقارير مقارنة أداء القنوات (بند 12)،
 *    بدون كشف هوية القناة للمشتركين.
 */

const { parseMessage, parseAsModification } = require('../parser/signalParser');

class MessageRouter {
  /**
   * @param {object} deps
   * @param {import('../engine/tradeStateMachine').TradeStateMachine} deps.stateMachine
   * @param {(result: {commands: any[], badges: string[], meta: object}) => void} [deps.onResult]
   *        Callback يُستدعى بكل نتيجة معالجة، عشان طبقة الحفظ/الإشعارات/الشارت تستهلكها.
   */
  constructor({ stateMachine, onResult } = {}) {
    if (!stateMachine) throw new Error('MessageRouter: stateMachine مطلوب');
    this.stateMachine = stateMachine;
    this.onResult = onResult || (() => {});

    // خريطة: messageId (بصيغة "channelId:messageId") → مرجع بسيط للتوصية اللي أنشأتها،
    // عشان لو جالنا Edit على نفس الرسالة نعرف نوجّهه كتعديل مباشر (بند 9).
    this._entryMessageIndex = new Map();

    // نافذة منع تكرار عبر القناتين (بند 3): بنسجل بصمة كل توصية دخول جديدة
    // وتوقيتها، عشان نفس التوصية لو جت من القناة التانية بعد شوية نتجاهلها
    // حتى لو الـ state machine غيّر حالة الصفقة بينهم (مثال: TP1 اتسجل قبل ما توصية القناة التانية توصل).
    this._recentEntryFingerprints = []; // [{ fingerprint, at }]
    this._FINGERPRINT_TTL_MS = 5 * 60 * 1000; // 5 دقايق كافية لفروق توقيت القنوات
  }

  /**
   * معالجة رسالة واحدة عادية (مش Edit).
   * @param {object} rawMessage - { text, channelId, messageId, timestamp }
   */
  ingest(rawMessage) {
    const { text, channelId, messageId, timestamp } = rawMessage;
    const meta = { channelId, messageId, timestamp };

    const event = parseMessage(text, meta);

    // فلترة إضافية لمنع التكرار عبر القناتين على مستوى الرسالة نفسها،
    // قبل حتى ما توصل لمحرك الحالة (دفاع مضاعف فوق الـ dedup الداخلي في الـ state machine)
    if (event.type === 'ENTRY') {
      const fingerprint = this._entryFingerprint(event);
      if (this._isRecentDuplicateFingerprint(fingerprint, timestamp)) {
        const result = { commands: [], badges: [], ignored: true, reason: 'CROSS_CHANNEL_DUPLICATE', meta };
        this.onResult(result);
        return result;
      }
      this._registerFingerprint(fingerprint, timestamp);
    }

    const outcome = this.stateMachine.handleEvent(event);

    // لو الحدث ده أنشأ صفقة فعلية (ENTRY مقبول)، نسجّل رقم الرسالة عشان نلحقه لو اتعدّل لاحقًا
    if (event.type === 'ENTRY' && !outcome.ignored) {
      this._entryMessageIndex.set(this._key(channelId, messageId), { channelId, messageId });
    }

    const result = { ...outcome, meta };
    this.onResult(result);
    return result;
  }

  /**
   * معالجة رسالة "Edit" حقيقية من تليجرام (نفس الرسالة اتعدّلت في مكانها).
   * لو الرسالة دي كانت رسالة دخول أنشأت توصية، بنعاملها كتعديل مباشر (بند 9)
   * حتى لو صاحب القناة معملش كلمة "تعديل" صراحة.
   */
  ingestEdit(rawMessage) {
    const { text, channelId, messageId, timestamp } = rawMessage;
    const meta = { channelId, messageId, timestamp, isEdit: true };
    const key = this._key(channelId, messageId);

    if (this._entryMessageIndex.has(key)) {
      const modEvent = { ...parseAsModification(text), meta };
      const outcome = this.stateMachine.handleEvent(modEvent);
      const result = { ...outcome, meta };
      this.onResult(result);
      return result;
    }

    // مش رسالة دخول معروفة → نعاملها كرسالة عادية جديدة (fallback آمن)
    return this.ingest(rawMessage);
  }

  /**
   * استرجاع ومعالجة رسائل فائتة بعد انقطاع اتصال (بند 2).
   * الرسائل ممكن تكون جايه من قناتين مختلفتين بترتيب استرجاع غير مرتب،
   * فبنرتبها هنا حسب وقتها الأصلي (timestamp) قبل التغذية للمحرك.
   * @param {Array} rawMessages - كل رسالة بنفس شكل ingest()
   * @returns {Array} نتيجة كل رسالة بنفس ترتيب معالجتها
   */
  replayMissed(rawMessages) {
    const sorted = [...rawMessages].sort((a, b) => a.timestamp - b.timestamp);
    return sorted.map((m) => (m.isEdit ? this.ingestEdit(m) : this.ingest(m)));
  }

  // ---------- أدوات داخلية ----------

  _key(channelId, messageId) {
    return `${channelId}:${messageId}`;
  }

  _entryFingerprint(event) {
    return `${event.direction}|${JSON.stringify(event.entryZone)}`;
  }

  _isRecentDuplicateFingerprint(fingerprint, timestamp) {
    this._pruneOldFingerprints(timestamp);
    return this._recentEntryFingerprints.some((f) => f.fingerprint === fingerprint);
  }

  _registerFingerprint(fingerprint, timestamp) {
    this._recentEntryFingerprints.push({ fingerprint, at: timestamp });
  }

  _pruneOldFingerprints(nowTimestamp) {
    this._recentEntryFingerprints = this._recentEntryFingerprints.filter(
      (f) => nowTimestamp - f.at < this._FINGERPRINT_TTL_MS
    );
  }
}

module.exports = { MessageRouter };
