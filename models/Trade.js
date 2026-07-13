/**
 * models/Trade.js
 * مخطط الصفقة في MongoDB. يغطي كل حقول دورة الحياة (بند 2-9)،
 * وحقول العرض على الشارت (بند 10)، والإحصائيات والتقارير (بند 12).
 */

const mongoose = require('mongoose');

const historyEntrySchema = new mongoose.Schema(
  {
    event: { type: String, required: true }, // ENTRY, MODIFY, TP1_HIT, SL_HIT, CONTINUE, ...
    raw: String,          // النص الأصلي للرسالة (للمراجعة الإدارية - بند 14)
    price: Number,
    points: Number,
    source: { type: String, enum: ['PROVIDER', 'SYSTEM', null], default: null },
    previousSnapshot: mongoose.Schema.Types.Mixed, // نسخة القيم القديمة عند التعديل (بند 9)
    at: { type: Date, required: true },
  },
  { _id: false }
);

const tradeSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ['BUY', 'SELL'], required: true },
    entryZone: { type: [Number], required: true },
    referencePrice: { type: Number, required: true },
    sl: Number,
    tp1: Number,
    tp2: Number,
    tp3: Number,
    activeTarget: { type: String, enum: ['TP1', 'TP2', 'TP3'], default: 'TP1' },

    status: {
      type: String,
      enum: [
        'ACTIVE', 'QUEUED', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT',
        'BREAK_EVEN_ACTIVATED', 'BREAK_EVEN_HIT', 'CLOSED_PROFIT', 'CLOSED_LOSS', 'CANCELLED',
      ],
      required: true,
      index: true,
    },

    breakEvenLevel: Number,
    breakEvenActivated: { type: Boolean, default: false },
    breakEvenHit: { type: Boolean, default: false },
    secureProfit: { type: Boolean, default: false },
    securePercent: Number,
    securedAt: { price: Number, at: Date },

    // بند 12: فصل نتائج القناتين داخليًا بدون إظهار أسمائهم للمشتركين
    sourceChannelId: { type: String, select: false }, // select:false يمنع رجوعه بالغلط في أي API عام
    sourceMessageId: { type: Number, select: false },

    finalPoints: Number, // النقاط النهائية عند إغلاق الصفقة (للتقارير - بند 12)

    history: [historyEntrySchema],

    createdAt: { type: Date, default: Date.now, index: true },
    closedAt: Date,
  },
  { timestamps: true }
);

// فهرس لدعم فلاتر التقارير (يوم/أسبوع/شهر/فترة مخصصة - بند 12)
tradeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Trade || mongoose.model('Trade', tradeSchema);
