/**
 * persistence/mongoTradeStore.js
 * التنفيذ الفعلي لواجهة TradeStore باستخدام Mongoose + MongoDB.
 * ده الملف اللي بيتشغل فعليًا على السيرفر؛ في الاختبارات بنستخدم fakeTradeStore بدل منه.
 */

const Trade = require('../models/Trade');

const mongoTradeStore = {
  async create(trade) {
    const doc = await Trade.create(this._toDoc(trade));
    return String(doc._id);
  },

  async update(id, trade) {
    await Trade.findByIdAndUpdate(id, this._toDoc(trade), { new: false });
  },

  async archive(id, trade) {
    const lastEntry = trade.history[trade.history.length - 1];
    await Trade.findByIdAndUpdate(id, {
      ...this._toDoc(trade),
      closedAt: new Date(),
      finalPoints: lastEntry?.points ?? null,
    });
  },

  // تحويل كائن الصفقة في الذاكرة لشكل مناسب للحفظ في Mongo
  _toDoc(trade) {
    return {
      direction: trade.direction,
      entryZone: trade.entryZone,
      referencePrice: trade.referencePrice,
      sl: trade.sl,
      tp1: trade.tp1,
      tp2: trade.tp2,
      tp3: trade.tp3,
      activeTarget: trade.activeTarget,
      status: trade.status,
      breakEvenLevel: trade.breakEvenLevel,
      breakEvenActivated: trade.breakEvenActivated,
      breakEvenHit: trade.breakEvenHit,
      secureProfit: trade.secureProfit,
      securePercent: trade.securePercent,
      securedAt: trade.securedAt,
      sourceChannelId: trade.meta?.channelId,
      sourceMessageId: trade.meta?.messageId,
      history: trade.history,
      createdAt: trade.createdAt ? new Date(trade.createdAt) : undefined,
    };
  },
};

module.exports = { mongoTradeStore };
