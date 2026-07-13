/**
 * priceFeed/tickIngestor.js
 *
 * طبقة "منطق صافٍ" بين مصدر السعر (جسر MT5) ومحرك الحالة، بنفس فلسفة
 * messageRouter.js بالظبط: مفيش أي اتصال شبكي هنا، عشان تتختبر بالكامل.
 *
 * مسؤولياتها:
 * 1) تمرير كل Tick لمحرك الحالة (onPriceTick) فورًا لحظة وصوله.
 * 2) تمرير أي أوامر ناتجة (زي TP1_HIT/SL_HIT) لطبقة الحفظ (بند 14: كل حدث يُحفظ فورًا).
 * 3) بث نفس الأوامر لطبقة العرض اللحظي (WebSocket للمشتركين - بند 11: 0-1 ثانية).
 * 4) رصد "تجمّد" مصدر السعر (مفيش Tick جديد لفترة طويلة) وتبليغ لوحة الإدارة (بند 14).
 */

class TickIngestor {
  /**
   * @param {object} deps
   * @param {import('../engine/tradeStateMachine').TradeStateMachine} deps.stateMachine
   * @param {import('../persistence/persistenceLayer').PersistenceLayer} [deps.persistence]
   * @param {(payload: {commands: any[], badges: string[], tick: object}) => void} [deps.onBroadcast]
   * @param {(msg: string) => void} [deps.onLog]
   * @param {number} [deps.staleAfterMs] - أقصى فجوة مسموحة بين تيكين قبل ما نعتبر المصدر متجمد (افتراضي 15 ثانية)
   */
  constructor({ stateMachine, persistence, onBroadcast, onLog, staleAfterMs = 15000 }) {
    if (!stateMachine) throw new Error('TickIngestor: stateMachine مطلوب');
    this.stateMachine = stateMachine;
    this.persistence = persistence || null;
    this.onBroadcast = onBroadcast || (() => {});
    this.onLog = onLog || (() => {});
    this.staleAfterMs = staleAfterMs;

    this.lastTickAt = null;
    this.lastPrice = null;
    this.isStale = false; // لتجنب تكرار نفس تنبيه "تجمّد المصدر" كل ثانية
  }

  /**
   * نقطة الدخول الرئيسية: تيك واحد جديد وصل من MT5.
   * @param {object} tick - { price: number, timestamp: number (ms) }
   * @returns {Promise<{commands: any[], badges: string[]}|{rejected: true, reason: string}>}
   */
  async handleTick(tick) {
    const validation = this._validate(tick);
    if (!validation.valid) {
      return { rejected: true, reason: validation.reason };
    }

    // لو المصدر كان متجمد وبعدين رجع، نسجل ده في اللوج (بند 14)
    if (this.isStale) {
      this.onLog('✅ مصدر السعر رجع يشتغل بعد انقطاع');
      this.isStale = false;
    }

    this.lastTickAt = tick.timestamp;
    this.lastPrice = tick.price;

    const outcome = this.stateMachine.onPriceTick(tick.price, tick.timestamp);

    if (this.persistence && outcome.commands?.length) {
      await this.persistence.applyCommands(outcome.commands);
    }

    if (outcome.commands?.length || outcome.badges?.length) {
      this.onBroadcast({ commands: outcome.commands, badges: outcome.badges, tick });
    }

    return outcome;
  }

  /**
   * يُستدعى دوريًا (مثلاً كل ثانية عن طريق setInterval في priceFeedServer.js)
   * عشان يكتشف لو مصدر السعر توقف عن إرسال Ticks فجأة.
   * @param {number} now - الوقت الحالي بالمللي ثانية
   */
  checkStale(now) {
    if (this.lastTickAt == null) return false; // لسه مفيش Tick وصل خالص
    const gap = now - this.lastTickAt;
    const staleNow = gap > this.staleAfterMs;

    if (staleNow && !this.isStale) {
      this.isStale = true;
      this.onLog(`⚠️ مفيش سعر جديد من MT5 منذ ${Math.round(gap / 1000)} ثانية`);
    }
    return this.isStale;
  }

  _validate(tick) {
    if (!tick || typeof tick.price !== 'number' || Number.isNaN(tick.price) || tick.price <= 0) {
      return { valid: false, reason: 'INVALID_PRICE' };
    }
    if (typeof tick.timestamp !== 'number' || tick.timestamp <= 0) {
      return { valid: false, reason: 'INVALID_TIMESTAMP' };
    }
    // حماية بسيطة ضد قفزة سعر غير منطقية (مثال: خطأ إرسال أو رقم فاسد من الجسر)
    if (this.lastPrice != null) {
      const jumpPercent = Math.abs(tick.price - this.lastPrice) / this.lastPrice;
      if (jumpPercent > 0.05) {
        // 5% قفزة لحظية في الذهب مستحيلة فعليًا إلا لو فيه خطأ في البيانات
        return { valid: false, reason: 'SUSPICIOUS_PRICE_JUMP' };
      }
    }
    return { valid: true };
  }
}

module.exports = { TickIngestor };
