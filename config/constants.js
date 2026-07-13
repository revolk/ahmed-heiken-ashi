/**
 * config/constants.js
 * كل القيم الثابتة والمفردات المعتمدة من وثيقة المتطلبات.
 * أي تغيير مستقبلي في القواعد (مثل نسبة الحجز) يتم من هنا فقط.
 */

module.exports = {
  // نسبة حجز الأرباح الافتراضية (بند 8) - لا تُغيّر إلا بقرار صريح من صاحب المشروع
  DEFAULT_SECURE_PROFIT_PERCENT: 50,

  // معامل تحويل فارق السعر إلى نقاط (بند 5): نقاط = |فارق السعر| × 10
  POINTS_MULTIPLIER: 10,

  // المنطقة الزمنية الافتراضية (بند 11)
  DEFAULT_TIMEZONE: 'Asia/Jerusalem',

  // الأصل الوحيد في المرحلة الحالية (بند 1)
  SUPPORTED_SYMBOLS: ['XAUUSD', 'GOLD', 'XAU/USD', 'الذهب'],

  // حالات الصفقة (Trade Status) - دورة الحياة الكاملة
  TRADE_STATUS: {
    PENDING_PREPARE: 'PENDING_PREPARE',   // رسالة استعد فقط، لسه مفيش دخول
    ACTIVE: 'ACTIVE',                     // BUY NOW / SELL NOW - الصفقة فعالة
    TP1_HIT: 'TP1_HIT',
    TP2_HIT: 'TP2_HIT',
    TP3_HIT: 'TP3_HIT',
    SL_HIT: 'SL_HIT',
    BREAK_EVEN_ACTIVATED: 'BREAK_EVEN_ACTIVATED', // فُعّل المستوى لكن لسه ملموسش
    BREAK_EVEN_HIT: 'BREAK_EVEN_HIT',             // رجع السعر ولمس التأمين - الصفقة انتهت
    CLOSED_PROFIT: 'CLOSED_PROFIT',
    CLOSED_LOSS: 'CLOSED_LOSS',
    CANCELLED: 'CANCELLED',
  },

  // الحالات التي تُعتبر "نهائية" (تُنهي حالة منع التكرار - بند 3)
  TERMINAL_STATUSES: [
    'TP1_HIT', // ملحوظة: TP1 ينهي منع التكرار لكن الصفقة تفضل تاريخيًا فعالة لعرض TP2/3 لو فيه CONTINUE
    'SL_HIT',
    'BREAK_EVEN_HIT',
    'CLOSED_PROFIT',
    'CLOSED_LOSS',
    'CANCELLED',
  ],

  DIRECTION: { BUY: 'BUY', SELL: 'SELL' },

  // مصدر التأكيد (بند 6) - هل النتيجة مؤكدة من صاحب القناة ولا من رصد السعر تلقائيًا
  CONFIRMATION_SOURCE: {
    PROVIDER: 'PROVIDER',   // أعلنها صاحب القناة
    SYSTEM: 'SYSTEM',       // رصدها النظام تلقائيًا من السعر
  },

  CHANNEL_TYPE: {
    PRIVATE: 'PRIVATE',
    PUBLIC: 'PUBLIC',
  },
};
