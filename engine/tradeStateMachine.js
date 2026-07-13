/**
 * engine/tradeStateMachine.js
 *
 * يطبّق البنود 2-9 من الوثيقة:
 * - صفقة فعالة واحدة فقط في نفس الوقت (بند 3)
 * - توصية معاكسة أثناء الصفقة تُحفظ مؤقتًا (بند 3)
 * - حساب النقاط بالمعادلة المعتمدة (بند 5)
 * - TP1 هو الهدف الافتراضي، ولا انتقال لـ TP2/TP3 إلا بـ CONTINUE صريح (بند 7)
 * - Break Even و Secure Profits بكل تركيباتهم (بند 8)
 * - Close / Cancel / Modify (بند 9)
 *
 * ملاحظة تصميم: المحرك هنا لا يعرف شيئًا عن تليجرون أو قاعدة البيانات؛
 * هو منطق صافٍ (pure state machine) يستقبل أحداث مُصنّفة من signalParser
 * ويُرجع أوامر واضحة (commands) لطبقة الحفظ/العرض تنفذها. ده بيخلّيه
 * قابل للاختبار بسهولة وقابل لإعادة الاستخدام في أي طبقة تخزين لاحقًا.
 */

const { TRADE_STATUS, DEFAULT_SECURE_PROFIT_PERCENT, POINTS_MULTIPLIER } = require('../config/constants');

function calcPoints(referencePrice, eventPrice, direction) {
  if (referencePrice == null || eventPrice == null) return null;
  const diff = direction === 'BUY' ? eventPrice - referencePrice : referencePrice - eventPrice;
  return Math.round(diff * POINTS_MULTIPLIER * 100) / 100; // بند 5: |فارق السعر| × 10
}

class TradeStateMachine {
  constructor({ getMarketPrice } = {}) {
    // getMarketPrice: دالة تُرجع سعر السوق اللحظي عند الحاجة (لو ملهاش سعر مذكور في الرسالة)
    this.getMarketPrice = getMarketPrice || (() => null);

    this.activeTrade = null;      // الصفقة الفعالة حاليًا (أو null)
    this.pendingOpposite = null;  // توصية معاكسة وصلت أثناء صفقة فعالة (بند 3)
    this.history = [];            // كل الصفقات التي انتهت (بند 12)
  }

  /**
   * نقطة الدخول الرئيسية: تستقبل حدث مُصنّف من signalParser وتُرجع
   * { commands: [...], badges: [...] } لتنفذها طبقة العرض/الحفظ/الإشعارات.
   */
  handleEvent(event) {
    switch (event.type) {
      case 'PREPARE':
        return this._handlePrepare(event);
      case 'ENTRY':
        return this._handleEntry(event);
      case 'MODIFY':
        return this._handleModify(event);
      case 'PROVIDER_HIT':
        return this._handleProviderHit(event);
      case 'CONTINUE':
        return this._handleContinue(event);
      case 'BREAK_EVEN_SECURE':
        return this._handleBreakEvenSecure(event);
      case 'CLOSE_NOW':
        return this._handleCloseNow(event);
      case 'CANCELLED':
        return this._handleCancelled(event);
      case 'NOISE':
      default:
        return { commands: [], badges: [], ignored: true };
    }
  }

  /**
   * يُستدعى من طبقة تتبّع السعر اللحظي (Tick feed) بشكل مستمر - بند 6:
   * "إذا لم يعلن شيئًا، يراقب النظام السعر الحقيقي ويسجل TP أو SL تلقائيًا"
   * وبند 6 أيضًا: لو TP و SL اتلمسوا في نفس الشمعة، الأسبقية لمن حدث أولًا (Tick/1-second).
   * لذلك هذه الدالة تُستدعى على كل Tick وليس على كل شمعة.
   */
  onPriceTick(price, timestamp) {
    if (!this.activeTrade || this.activeTrade.status !== TRADE_STATUS.ACTIVE) {
      // حتى لو الصفقة في حالة TP1_HIT، نفضل نراقب break-even ونراقب continue targets
    }
    if (!this.activeTrade) return { commands: [], badges: [] };

    const trade = this.activeTrade;
    const commands = [];
    const badges = [];

    // مراقبة الهدف النشط الحالي (TP1 افتراضيًا، أو TP2/TP3 لو فيه CONTINUE)
    const activeTargetKey = trade.activeTarget; // 'TP1' | 'TP2' | 'TP3'
    const activeTargetPrice = trade[activeTargetKey.toLowerCase()];
    const slPrice = trade.sl;

    const touchedTarget = activeTargetPrice != null && this._priceTouched(price, activeTargetPrice, trade.direction, 'TP');
    const touchedSl = slPrice != null && this._priceTouched(price, slPrice, trade.direction, 'SL');

    // لو اتلمسوا الاتنين في نفس اللحظة، بما إن الدالة بتتنادى تيك-تيك، أسبقية الاستدعاء = أسبقية الحدوث فعليًا
    if (touchedTarget && trade.status !== TRADE_STATUS[`${activeTargetKey}_HIT`]) {
      this._registerTargetHit(trade, activeTargetKey, price, timestamp, 'SYSTEM', commands, badges);
    } else if (touchedSl && trade.status === TRADE_STATUS.ACTIVE) {
      this._registerSlHit(trade, price, timestamp, 'SYSTEM', commands, badges);
    }

    // مراقبة مستوى التأمين (Break Even) لو مُفعّل
    if (trade.breakEvenActivated && !trade.breakEvenHit && trade.breakEvenLevel != null) {
      const touchedBE = this._priceTouched(price, trade.breakEvenLevel, trade.direction, 'BE');
      if (touchedBE) {
        this._registerBreakEvenHit(trade, price, timestamp, commands, badges);
      }
    }

    return { commands, badges };
  }

  // ---------- معالجات الأحداث ----------

  _handlePrepare(event) {
    // بند 2: PREPARE تنبيه تحضيري فقط، لا يبدأ صفقة ولا يُنشئ سجل فعلي
    return {
      commands: [{ action: 'SHOW_PREPARE_ALERT', direction: event.direction }],
      badges: ['PREPARE'],
    };
  }

  _handleEntry(event) {
    const commands = [];
    const badges = [];

    // منع التكرار (بند 3): لو نفس التوصية (اتجاه+دخول+وقت قريب) موجودة بالفعل وفعالة، نتجاهل
    if (this.activeTrade && this._isDuplicate(this.activeTrade, event)) {
      return { commands: [], badges: [], ignored: true, reason: 'DUPLICATE' };
    }

    if (this.activeTrade) {
      // فيه صفقة فعالة بالفعل → التوصية الجديدة معاكسة أو نفس الاتجاه؟
      // بند 3: أي توصية جديدة أثناء وجود صفقة فعالة تُحفظ مؤقتًا (لا تظهر) حتى تُغلق الحالية
      this.pendingOpposite = this._buildTradeFromEntry(event);
      return {
        commands: [{ action: 'QUEUE_PENDING_SIGNAL', trade: this.pendingOpposite }],
        badges: [],
      };
    }

    // مفيش صفقة فعالة → التوصية دي تبقى الصفقة الفعالة الجديدة فورًا (بند 4: لا تنتظر لمس المنطقة)
    const trade = this._buildTradeFromEntry(event);
    this.activeTrade = trade;

    commands.push({ action: 'CREATE_TRADE', trade });
    commands.push({ action: 'DRAW_CHART_LEVELS', trade });
    badges.push(event.direction === 'BUY' ? 'BUY NOW' : 'SELL NOW');

    return { commands, badges };
  }

  _buildTradeFromEntry(event) {
    return {
      direction: event.direction,
      entryZone: event.entryZone,
      referencePrice: event.referencePrice,
      sl: event.sl,
      breakEvenLevel: event.referencePrice, // بند 4: مستوى التأمين = السعر المرجعي نفسه في البداية
      tp1: event.tp1,
      tp2: event.tp2,
      tp3: event.tp3,
      activeTarget: 'TP1', // بند 6: الهدف الأساسي الافتراضي
      status: TRADE_STATUS.ACTIVE,
      breakEvenActivated: false,
      breakEvenHit: false,
      secureProfit: false,
      securePercent: null,
      history: [{ event: 'ENTRY', raw: event.raw, at: event.meta?.timestamp || Date.now() }],
      createdAt: event.meta?.timestamp || Date.now(),
    };
  }

  _isDuplicate(activeTrade, newEvent) {
    if (activeTrade.direction !== newEvent.direction) return false;
    const sameEntry =
      JSON.stringify(activeTrade.entryZone) === JSON.stringify(newEvent.entryZone);
    return sameEntry; // المقارنة الأساسية: نفس الاتجاه + نفس منطقة الدخول (بند 3)
  }

  _handleModify(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;
    const previousSnapshot = { ...trade };

    if (event.newEntryZone?.length) {
      trade.entryZone = event.newEntryZone;
      trade.referencePrice =
        trade.direction === 'BUY' ? Math.min(...event.newEntryZone) : Math.max(...event.newEntryZone);
      trade.breakEvenLevel = trade.referencePrice; // إعادة حساب التأمين تبعًا للمرجع الجديد
    }
    if (event.newSl != null) trade.sl = event.newSl;
    if (event.newTp1 != null) trade.tp1 = event.newTp1;
    if (event.newTp2 != null) trade.tp2 = event.newTp2;
    if (event.newTp3 != null) trade.tp3 = event.newTp3;

    trade.history.push({ event: 'MODIFY', previousSnapshot, raw: event.raw, at: Date.now() });

    return {
      commands: [{ action: 'UPDATE_TRADE', trade }, { action: 'REDRAW_CHART_LEVELS', trade }],
      badges: ['MODIFIED'],
    };
  }

  _handleProviderHit(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;
    const commands = [];
    const badges = [];
    const price = this.getMarketPrice() ?? null;

    if (event.target === 'SL') {
      this._registerSlHit(trade, price, Date.now(), 'PROVIDER', commands, badges);
    } else {
      this._registerTargetHit(trade, event.target, price, Date.now(), 'PROVIDER', commands, badges);
    }
    return { commands, badges };
  }

  _registerTargetHit(trade, targetKey, price, timestamp, source, commands, badges) {
    const statusKey = `${targetKey}_HIT`; // 'TP1_HIT' مثلاً
    trade.status = TRADE_STATUS[statusKey];
    const points = calcPoints(trade.referencePrice, price ?? trade[targetKey.toLowerCase()], trade.direction);

    trade.history.push({ event: statusKey, price, points, source, at: timestamp });
    commands.push({ action: 'SHOW_TARGET_HIT', target: targetKey, points, source });
    badges.push(`${targetKey} HIT SUCCESSFULLY`);

    if (targetKey === 'TP1') {
      // بند 6: TP1 لا يوقف الصفقة تلقائيًا لكن يُقفل باب منع التكرار،
      // والصفقة تفضل مفتوحة فقط لو فيه CONTINUE لاحقًا (بند 7) وإلا تُعتبر مكتملة تاريخيًا.
      // مهم: لازم نبعت UPDATE_TRADE هنا صراحة لأن الصفقة لسه مش بتتقفل (ARCHIVE_TRADE)،
      // فلو ما بعتناش الأمر ده، تغيير الحالة لـ TP1_HIT مكانش هيتحفظ في القاعدة أبدًا (بند 14).
      commands.push({ action: 'UPDATE_TRADE', trade });
      commands.push({ action: 'RELEASE_DUPLICATE_LOCK' });
      this._promoteQueuedIfAny(commands, badges);
    } else {
      // TP2 أو TP3: هي نهاية الصفقة الفعلية (بند 7 - ما فيش هدف بعدها إلا استمرار تاني)
      this._archiveTrade(commands);
    }
  }

  _registerSlHit(trade, price, timestamp, source, commands, badges) {
    trade.status = TRADE_STATUS.SL_HIT;
    const eventPrice = price ?? trade.sl;
    const points = calcPoints(trade.referencePrice, eventPrice, trade.direction);
    trade.history.push({ event: 'SL_HIT', price: eventPrice, points, source, at: timestamp });
    commands.push({ action: 'SHOW_SL_HIT', points, source });
    badges.push('SL HIT');
    this._archiveTrade(commands);
    this._promoteQueuedIfAny(commands, badges);
  }

  _handleContinue(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;

    // بند 7: بدون CONTINUE صريح، مفيش انتقال. هنا وصل صراحة.
    trade.activeTarget = event.target; // 'TP2' أو 'TP3'
    trade.status = TRADE_STATUS.ACTIVE; // نعيدها لحالة نشطة لمراقبة الهدف الجديد
    trade.history.push({ event: 'CONTINUE', target: event.target, raw: event.raw, at: Date.now() });

    return {
      commands: [{ action: 'SHOW_CONTINUE_BADGE', target: event.target }, { action: 'UPDATE_TRADE', trade }],
      badges: [`CONTINUE TO ${event.target}`],
    };
  }

  _handleBreakEvenSecure(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;
    const commands = [];
    const badges = [];

    if (event.breakEven) {
      trade.breakEvenActivated = true; // بند 8: بريك ايفن فقط = تفعيل المستوى، مفيش حجز أرباح
      badges.push('BREAK EVEN ACTIVATED');
    }
    if (event.secureProfit) {
      trade.secureProfit = true;
      trade.securePercent = event.securePercent ?? DEFAULT_SECURE_PROFIT_PERCENT; // بند 8: 50% افتراضي دائمًا
      const eventPrice = event.mentionedPrice ?? this.getMarketPrice();
      const fullMovePoints = calcPoints(trade.referencePrice, eventPrice, trade.direction);
      trade.securedAt = { price: eventPrice, at: Date.now() };
      // بند 8: تُعرض كحركة كاملة دون تقسيم، حتى لو النسبة 50%
      commands.push({ action: 'SHOW_PROFIT_SECURED', points: fullMovePoints, percent: trade.securePercent });
      badges.push(`${trade.securePercent}% PROFIT SECURED`);
    }

    trade.history.push({ event: 'BREAK_EVEN_SECURE', ...event, at: Date.now() });
    commands.push({ action: 'UPDATE_TRADE', trade });

    return { commands, badges };
  }

  _registerBreakEvenHit(trade, price, timestamp, commands, badges) {
    trade.status = TRADE_STATUS.BREAK_EVEN_HIT;
    trade.breakEvenHit = true;
    const points = calcPoints(trade.referencePrice, price, trade.direction);
    trade.history.push({ event: 'BREAK_EVEN_HIT', price, points, at: timestamp });
    commands.push({ action: 'SHOW_BREAK_EVEN_HIT', points, secured: trade.secureProfit });
    badges.push('BREAK EVEN HIT');
    // بند 9 + بند 12: BREAK EVEN + PROFIT SECURED تُحسب رابحة؛ بدون ربح فئة مستقلة
    this._archiveTrade(commands);
    this._promoteQueuedIfAny(commands, badges);
  }

  _handleCloseNow(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;
    const commands = [];
    const badges = [];

    const eventPrice = event.mentionedPrice ?? this.getMarketPrice();
    const points = calcPoints(trade.referencePrice, eventPrice, trade.direction);
    trade.status = points >= 0 ? TRADE_STATUS.CLOSED_PROFIT : TRADE_STATUS.CLOSED_LOSS;
    trade.history.push({ event: 'CLOSE_NOW', price: eventPrice, points, at: Date.now() });

    commands.push({ action: 'SHOW_CLOSE_RESULT', profit: points >= 0, points });
    badges.push(points >= 0 ? 'CLOSED IN PROFIT' : 'CLOSED IN LOSS');

    this._archiveTrade(commands);
    this._promoteQueuedIfAny(commands, badges);

    return { commands, badges };
  }

  _handleCancelled(event) {
    if (!this.activeTrade) return { commands: [], badges: [], ignored: true };
    const trade = this.activeTrade;
    trade.status = TRADE_STATUS.CANCELLED;
    trade.history.push({ event: 'CANCELLED', raw: event.raw, at: Date.now() });

    const commands = [{ action: 'SHOW_CANCELLED' }];
    const badges = ['CANCELLED / CONDITIONS NOT MET'];

    this._archiveTrade(commands);
    // بند 9: بعد الإلغاء لا تُعاد الصفقة تلقائيًا؛ لكن التوصية المعاكسة المحفوظة (لو فيه) تُعرض الآن
    this._promoteQueuedIfAny(commands, badges);

    return { commands, badges };
  }

  // ---------- أدوات داخلية ----------

  _priceTouched(currentPrice, levelPrice, direction, kind) {
    // TP: BUY لازم السعر يوصل لفوق الهدف، SELL لازم يوصل لتحت الهدف
    // SL: BUY لازم السعر ينزل تحت الستوب، SELL لازم يطلع فوق الستوب
    // BE: نفس منطق TP بس عند مستوى المرجع
    if (kind === 'TP' || kind === 'BE') {
      return direction === 'BUY' ? currentPrice >= levelPrice : currentPrice <= levelPrice;
    }
    if (kind === 'SL') {
      return direction === 'BUY' ? currentPrice <= levelPrice : currentPrice >= levelPrice;
    }
    return false;
  }

  _archiveTrade(commands) {
    if (!this.activeTrade) return;
    this.history.push(this.activeTrade);
    commands.push({ action: 'ARCHIVE_TRADE', trade: this.activeTrade });
    this.activeTrade = null;
  }

  _promoteQueuedIfAny(commands, badges) {
    // بند 3: "بعدها تُعرض أحدث توصية ما زالت صالحة"
    if (this.pendingOpposite) {
      this.activeTrade = this.pendingOpposite;
      this.pendingOpposite = null;
      commands.push({ action: 'CREATE_TRADE', trade: this.activeTrade });
      commands.push({ action: 'DRAW_CHART_LEVELS', trade: this.activeTrade });
      badges.push(this.activeTrade.direction === 'BUY' ? 'BUY NOW' : 'SELL NOW');
    }
  }
}

module.exports = { TradeStateMachine, calcPoints };
