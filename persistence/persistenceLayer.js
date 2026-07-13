/**
 * persistence/persistenceLayer.js
 *
 * تربط مخرجات محرك الحالة (commands) بأي طبقة تخزين، من غير ما تعرف
 * تفاصيل MongoDB نفسها. ده بيخليها قابلة للاختبار الكامل بدون قاعدة بيانات
 * حقيقية (باستخدام "store" وهمي في الاختبارات)، وفي نفس الوقت جاهزة للإنتاج
 * عن طريق mongoTradeStore.js.
 *
 * قاعدة أساسية (بند 14): "تُحفظ كل رسالة وحدث وتعديل فورًا داخل قاعدة البيانات" —
 * فكل ENTRY/MODIFY/HIT/CLOSE... بيوصل هنا فورًا لحظة حدوثه، مفيش تجميع أو تأجيل.
 *
 * @typedef {object} TradeStore
 * @property {(trade: object) => Promise<string>} create - يحفظ صفقة جديدة ويرجع الـ id بتاعها
 * @property {(id: string, trade: object) => Promise<void>} update - يحدّث صفقة موجودة
 * @property {(id: string, trade: object) => Promise<void>} archive - يقفل الصفقة نهائيًا (closedAt + finalPoints)
 */

// الأوامر اللي طبقة الحفظ فعلاً مسؤولة عنها. باقي الأوامر (SHOW_*, DRAW_CHART_LEVELS...)
// خاصة بطبقة العرض/الإشعارات وبيتم تجاهلها هنا عمدًا.
const PERSISTABLE_ACTIONS = new Set(['CREATE_TRADE', 'UPDATE_TRADE', 'ARCHIVE_TRADE', 'QUEUE_PENDING_SIGNAL']);

class PersistenceLayer {
  /**
   * @param {object} deps
   * @param {TradeStore} deps.tradeStore
   * @param {(err: Error, cmd: object) => void} [deps.onError]
   */
  constructor({ tradeStore, onError }) {
    if (!tradeStore) throw new Error('PersistenceLayer: tradeStore مطلوب');
    this.tradeStore = tradeStore;
    this.onError = onError || ((err) => console.error('❌ خطأ في الحفظ:', err));

    // WeakMap: كائن الصفقة في الذاكرة (نفس المرجع اللي بيستخدمه state machine) → id بتاعها في القاعدة.
    // ده بيسمحلنا نربط CREATE_TRADE بـ UPDATE_TRADE/ARCHIVE_TRADE اللاحقة على نفس الصفقة
    // من غير ما نضطر نمرر id يدويًا في كل مكان في محرك الحالة.
    this._idMap = new WeakMap();
  }

  /**
   * نقطة الدخول الرئيسية: تستقبل مصفوفة commands الراجعة من stateMachine.handleEvent()
   * أو stateMachine.onPriceTick()، وتنفذ اللي يخص الحفظ منها بالترتيب.
   */
  async applyCommands(commands = []) {
    for (const cmd of commands) {
      if (!PERSISTABLE_ACTIONS.has(cmd.action)) continue;
      try {
        await this._applyOne(cmd);
      } catch (err) {
        this.onError(err, cmd);
      }
    }
  }

  async _applyOne(cmd) {
    switch (cmd.action) {
      case 'CREATE_TRADE': {
        const id = await this.tradeStore.create(cmd.trade);
        this._idMap.set(cmd.trade, id);
        break;
      }
      case 'QUEUE_PENDING_SIGNAL': {
        // بند 14: حتى التوصية المعاكسة المؤجلة (بند 3) بتتحفظ فورًا كسجل إداري،
        // لكن بحالة QUEUED عشان توضح إنها لسه مش ظاهرة للمشتركين
        const id = await this.tradeStore.create({ ...cmd.trade, status: 'QUEUED' });
        this._idMap.set(cmd.trade, id);
        break;
      }
      case 'UPDATE_TRADE': {
        const id = this._idMap.get(cmd.trade);
        if (!id) return; // صفقة معروفتش لطبقة الحفظ (نادر - غالبًا خطأ ترتيب)، بنتجاهلها بأمان
        await this.tradeStore.update(id, cmd.trade);
        break;
      }
      case 'ARCHIVE_TRADE': {
        const id = this._idMap.get(cmd.trade);
        if (!id) return;
        await this.tradeStore.archive(id, cmd.trade);
        break;
      }
      default:
        break;
    }
  }
}

module.exports = { PersistenceLayer, PERSISTABLE_ACTIONS };
