/**
 * parser/signalParser.js
 *
 * الوظيفة: تحويل رسالة نصية خام (عربي/إنجليزي/مختلط) من تليجرام إلى
 * حدث مُصنّف ومُنظّم (Structured Event) يفهمه محرك حالة الصفقة (State Machine).
 *
 * مبدأ أساسي من الوثيقة: "أي معلومة غير موجودة تبقى فارغة؛ ممنوع اختراع
 * أسعار أو تفاصيل" — لذلك هذا الملف لا يخمّن قيمًا، فقط يستخرج ما هو مكتوب فعليًا.
 */

// ---------- أدوات مساعدة عامة ----------

// تطبيع الأرقام العربية (٠١٢٣٤٥٦٧٨٩) إلى إنجليزية، وتوحيد الفواصل العشرية
function normalizeDigits(text) {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return text.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

// استخراج أول رقم عشري بعد كلمة مفتاحية معينة داخل نص
// ملحوظة مهمة: keywordRegex قد يحتوي مجموعات capture داخلية خاصة به (زي (sl|stop\s*loss|...)),
// فبنستخدم match[match.length - 1] بدل match[1] عشان نضمن إننا بناخد آخر مجموعة (رقمنا احنا) دايمًا،
// مهما كان عدد المجموعات الداخلية في الكلمة المفتاحية.
function extractNumberAfter(text, keywordRegex) {
  const re = new RegExp(
    '(?:' + keywordRegex.source + ')\\s*(?:(?:الى|إلى|to|is|:|[-–—])\\s*)?(\\d+(?:\\.\\d+)?)',
    'i'
  );
  const match = text.match(re);
  return match ? parseFloat(match[match.length - 1]) : null;
}

// استخراج كل الأرقام العشرية الموجودة في نص (بالترتيب)
function extractAllNumbers(text) {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

// ---------- قواميس الكلمات المفتاحية (عربي + إنجليزي) ----------

// ملحوظة تقنية مهمة: \b في JavaScript regex مبني على أحرف ASCII الإنجليزية فقط
// ([A-Za-z0-9_])، والحروف العربية مش معتبرة "أحرف كلمة" بالنسبة له. ده معناه إن
// \bكلمة_عربية\b ممكن يفشل في التعرف على حدود الكلمة بشكل صحيح. عشان كده هنا:
// - الكلمات الإنجليزية البحتة بتستخدم \b عادي (يشتغل صح).
// - الكلمات العربية بتتلف بحدود يدوية آمنة: (?:^|\s|[^ء-ي]) قبلها و(?=\s|$|[^ء-ي]) بعدها،
//   عشان نمنع تطابق جزء من كلمة تانية بالغلط بدون الاعتماد على \b المكسور مع العربي.
function arabicBoundary(pattern) {
  return `(?:^|[^\\u0600-\\u06FF])(?:${pattern})(?=$|[^\\u0600-\\u06FF])`;
}

function mixedKeyword(englishPattern, arabicPattern) {
  // نجمع نمط إنجليزي محاط بـ \b الطبيعي + نمط عربي محاط بحدود يدوية
  return new RegExp(`\\b(?:${englishPattern})\\b|${arabicBoundary(arabicPattern)}`, 'i');
}

const KEYWORDS = {
  buy: mixedKeyword('buy|long', 'شراء|شرا|لونج'),
  sell: mixedKeyword('sell|short', 'بيع|شورت'),
  now: mixedKeyword('now', 'الان|الآن|حالا|فورا'),
  prepare: mixedKeyword('prepare', 'استعد|تجهيز'),

  entryLabel: mixedKeyword('entry', 'دخول|منطقة\\s*الدخول|من'),
  slLabel: mixedKeyword('sl|stop\\s*loss', 'ستوب|وقف\\s*الخسارة|وقف'),

  tp1: mixedKeyword('tp\\s*1', 'الهدف\\s*(?:الاول|الأول|1)|هدف\\s*1'),
  tp2: mixedKeyword('tp\\s*2', 'الهدف\\s*(?:الثاني|2)|هدف\\s*2'),
  tp3: mixedKeyword('tp\\s*3', 'الهدف\\s*(?:الثالث|3)|هدف\\s*3'),
  tpGeneric: mixedKeyword('tp|target', 'هدف'),

  continue: mixedKeyword('continue', 'استمرار|كمل|استمر'),

  breakEven: mixedKeyword('break\\s*even', 'بريك\\s*ايفن|تأمين'),
  // بيغطي الترتيبين المحتملين في الإنجليزي: "secure profit" أو "profit secured"
  secureProfits: mixedKeyword('secure[ds]?\\s*profits?|profits?\\s*secure[ds]?', 'حجز\\s*(?:الارباح|أرباح)|حجز'),

  closeNow: mixedKeyword('close\\s*now', 'اقفل|أقفل|إغلاق|اغلاق'),
  cancelled: mixedKeyword('cancel(?:led)?', 'الغاء|إلغاء|ملغا[ةه]|شروط\\s*لم\\s*تتحقق'),

  modify: mixedKeyword('modify|update|edit', 'تعديل|تحديث|تعدیل'),

  hit: mixedKeyword('hit', 'تحقق|لمس|ضرب'),
};

const SYMBOL_REGEX = mixedKeyword('xau\\s*/?\\s*usd|xauusd|gold', 'الذهب|ذهب');

/**
 * الخطوة 1: هل الرسالة تخص الذهب أصلاً؟ (بند 1 - النطاق)
 * لو مفيش رمز واضح، نعتبرها مرتبطة بالسياق الحالي (الصفقة الفعالة) بدل ما نرفضها،
 * لأن أغلب رسائل التحديث (SL/TP/Close) مبتكررش اسم الرمز.
 */
function mentionsGoldSymbol(text) {
  return SYMBOL_REGEX.test(text);
}

/**
 * الخطوة 2: تصنيف نوع الرسالة (event type) - بند 2 التمييز بين التوصية
 * والتحليل والخبر والكلام العام.
 *
 * الترتيب هنا مهم: نتحقق من الأحداث الأكثر تحديدًا أولاً.
 */
function classifyMessage(rawText) {
  const text = normalizeDigits(rawText.trim());

  // رسالة إلغاء
  if (KEYWORDS.cancelled.test(text)) {
    return buildCancelledEvent(text);
  }

  // رسالة إغلاق
  if (KEYWORDS.closeNow.test(text)) {
    return buildCloseEvent(text);
  }

  // استمرار لهدف تالي
  if (KEYWORDS.continue.test(text) && (KEYWORDS.tp2.test(text) || KEYWORDS.tp3.test(text))) {
    return buildContinueEvent(text);
  }

  // بريك ايفن / حجز أرباح (قد يردا معًا في نفس الرسالة - بند 8)
  if (KEYWORDS.breakEven.test(text) || KEYWORDS.secureProfits.test(text)) {
    return buildBreakEvenOrSecureEvent(text);
  }

  // تحقق هدف أو ستوب (إعلان صريح من صاحب القناة)
  if (KEYWORDS.hit.test(text) && (KEYWORDS.tp1.test(text) || KEYWORDS.tp2.test(text) || KEYWORDS.tp3.test(text) || KEYWORDS.slLabel.test(text))) {
    return buildProviderHitEvent(text);
  }

  // تعديل صريح على توصية قائمة
  if (KEYWORDS.modify.test(text)) {
    return buildModifyEvent(text);
  }

  // رسالة تحضيرية (PREPARE) - لا تبدأ صفقة
  if (KEYWORDS.prepare.test(text) && !KEYWORDS.now.test(text)) {
    return buildPrepareEvent(text);
  }

  // دخول فعلي: BUY NOW / SELL NOW
  const isBuy = KEYWORDS.buy.test(text);
  const isSell = KEYWORDS.sell.test(text);
  if ((isBuy || isSell) && KEYWORDS.now.test(text)) {
    return buildEntryEvent(text, isBuy ? 'BUY' : 'SELL');
  }

  // دخول بدون كلمة NOW صريحة، لكن فيه اتجاه + منطقة دخول + أرقام كافية
  // (تحوّط: بعض القنوات بتكتب BUY XAUUSD 3363-3365 من غير "NOW")
  if ((isBuy || isSell) && extractAllNumbers(text).length >= 1 && mentionsGoldSymbol(text)) {
    return buildEntryEvent(text, isBuy ? 'BUY' : 'SELL');
  }

  // مفيش تصنيف واضح = تحليل/خبر/كلام عام → NOISE (بند 2)
  return { type: 'NOISE', raw: rawText };
}

// ---------- بناء كل نوع حدث على حدة ----------

function extractEntryZone(text) {
  // نمط: "من 3363 الى 3365" أو "from 3363 to 3365" أو "3363-3365" أو "3363/3365"
  const rangePatterns = [
    /(?:من|from)\s*(\d+(?:\.\d+)?)\s*(?:الى|إلى|to|-|–|—)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*[-–—/]\s*(\d+(?:\.\d+)?)/,
  ];
  for (const pattern of rangePatterns) {
    const m = text.match(pattern);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])].sort((a, b) => a - b);
  }
  // سعر دخول واحد بدون نطاق
  const single = extractNumberAfter(text, KEYWORDS.entryLabel);
  return single !== null ? [single] : [];
}

function buildEntryEvent(text, direction) {
  const entryZone = extractEntryZone(text);
  const sl = extractNumberAfter(text, KEYWORDS.slLabel);
  const tp1 = extractNumberAfter(text, KEYWORDS.tp1);
  const tp2 = extractNumberAfter(text, KEYWORDS.tp2);
  const tp3 = extractNumberAfter(text, KEYWORDS.tp3);

  // القاعدة المرجعية (بند 4): BUY = أقل سعر في المنطقة، SELL = أعلى سعر
  let referencePrice = null;
  if (entryZone.length === 2) {
    referencePrice = direction === 'BUY' ? Math.min(...entryZone) : Math.max(...entryZone);
  } else if (entryZone.length === 1) {
    referencePrice = entryZone[0];
  }

  return {
    type: 'ENTRY',
    direction,
    entryZone,
    referencePrice,
    sl,
    tp1,
    tp2,
    tp3,
    raw: text,
  };
}

function buildPrepareEvent(text) {
  const isBuy = KEYWORDS.buy.test(text);
  const isSell = KEYWORDS.sell.test(text);
  return {
    type: 'PREPARE',
    direction: isBuy ? 'BUY' : isSell ? 'SELL' : null,
    raw: text,
  };
}

function buildModifyEvent(text) {
  return {
    type: 'MODIFY',
    newEntryZone: extractEntryZone(text),
    newSl: extractNumberAfter(text, KEYWORDS.slLabel),
    newTp1: extractNumberAfter(text, KEYWORDS.tp1),
    newTp2: extractNumberAfter(text, KEYWORDS.tp2),
    newTp3: extractNumberAfter(text, KEYWORDS.tp3),
    raw: text,
  };
}

function buildContinueEvent(text) {
  const target = KEYWORDS.tp3.test(text) ? 'TP3' : 'TP2';
  return { type: 'CONTINUE', target, raw: text };
}

function buildBreakEvenOrSecureEvent(text) {
  const hasBreakEven = KEYWORDS.breakEven.test(text);
  const hasSecure = KEYWORDS.secureProfits.test(text);

  // نسبة الحجز: رقم متبوع مباشرة بعلامة % (مثال: "50%")
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const securePercent = percentMatch ? parseFloat(percentMatch[1]) : null;

  // السعر المذكور: أول رقم في النص "مش" متبوع بعلامة % (عشان مايتلخبطش مع النسبة)
  const priceMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(%?)/g)].filter((m) => m[2] !== '%');
  const mentionedPrice = priceMatches.length ? parseFloat(priceMatches[0][1]) : null;

  return {
    type: 'BREAK_EVEN_SECURE',
    breakEven: hasBreakEven,
    secureProfit: hasSecure,
    // لو مفيش رقم نسبة صريح، تُترك null والـ state machine هو اللي يطبّق الـ 50% الافتراضية (بند 8)
    securePercent,
    mentionedPrice,
    raw: text,
  };
}

function buildProviderHitEvent(text) {
  let target = null;
  if (KEYWORDS.tp1.test(text)) target = 'TP1';
  else if (KEYWORDS.tp2.test(text)) target = 'TP2';
  else if (KEYWORDS.tp3.test(text)) target = 'TP3';
  else if (KEYWORDS.slLabel.test(text)) target = 'SL';

  return {
    type: 'PROVIDER_HIT',
    target,
    confirmationSource: 'PROVIDER',
    raw: text,
  };
}

function buildCloseEvent(text) {
  const numbers = extractAllNumbers(text);
  return {
    type: 'CLOSE_NOW',
    mentionedPrice: numbers.length ? numbers[0] : null, // بند 5: لو ذُكر سعر يُستخدم، وإلا سعر السوق لحظتها
    raw: text,
  };
}

function buildCancelledEvent(text) {
  return { type: 'CANCELLED', raw: text };
}

// ---------- واجهة الاستخدام الرئيسية ----------

/**
 * parseMessage: نقطة الدخول الوحيدة المستخدمة من الخارج.
 * @param {string} rawText - نص الرسالة كما وصل من تليجرام
 * @param {object} meta - بيانات إضافية: { channelId, channelType, messageId, timestamp }
 * @returns {object} حدث مُصنّف جاهز لمحرك حالة الصفقة
 */
function parseMessage(rawText, meta = {}) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { type: 'NOISE', raw: rawText, meta };
  }
  const event = classifyMessage(rawText);
  return { ...event, meta };
}

module.exports = {
  parseMessage,
  // دالة مستقلة لاستخراج حقول التعديل من نص، بدون اشتراط وجود كلمة "تعديل" صراحة.
  // بتُستخدم لما نعرف هيكليًا (من نوع الحدث في تليجرام) إن الرسالة دي "Edit" لرسالة دخول
  // سابقة، حتى لو صاحب القناة مكتبش كلمة "تعديل" في نصه.
  parseAsModification: buildModifyEvent,
  // نصدّر الدوال الداخلية أيضًا لتسهيل كتابة اختبارات دقيقة عليها
  _internal: {
    normalizeDigits,
    extractAllNumbers,
    extractEntryZone,
    classifyMessage,
    mentionsGoldSymbol,
  },
};
