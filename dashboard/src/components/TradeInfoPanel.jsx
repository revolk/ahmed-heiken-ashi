import './tradeInfoPanel.css';

const STATUS_LABELS = {
  ACTIVE: 'فعالة',
  TP1_HIT: 'TP1 تحقق',
  TP2_HIT: 'TP2 تحقق',
  TP3_HIT: 'TP3 تحقق',
  SL_HIT: 'ستوب لوز',
  BREAK_EVEN_ACTIVATED: 'تأمين مفعّل',
  BREAK_EVEN_HIT: 'تأمين تحقق',
  CLOSED_PROFIT: 'مقفولة بربح',
  CLOSED_LOSS: 'مقفولة بخسارة',
  CANCELLED: 'ملغاة',
};

/**
 * TradeInfoPanel.jsx — بند 10: "مربع واحد للتوصية يحتوي: BUY/SELL، Entry Zone،
 * Reference Price، SL، TP1/TP2/TP3، الحالة، النقاط والأوقات."
 */
export default function TradeInfoPanel({ trade }) {
  if (!trade) {
    return (
      <div className="trade-panel trade-panel--empty">
        <p>مفيش صفقة فعالة دلوقتي</p>
        <span className="trade-panel__hint">في انتظار توصية جديدة من القنوات</span>
      </div>
    );
  }

  const isBuy = trade.direction === 'BUY';
  const lastPoints = trade.history?.[trade.history.length - 1]?.points;

  return (
    <div className={`trade-panel trade-panel--${isBuy ? 'buy' : 'sell'}`}>
      <header className="trade-panel__header">
        <span className="trade-panel__direction">{isBuy ? 'BUY' : 'SELL'}</span>
        <span className="trade-panel__status">{STATUS_LABELS[trade.status] || trade.status}</span>
      </header>

      <div className="trade-panel__grid">
        <Field label="Entry Zone" value={trade.entryZone?.join(' – ') ?? '—'} />
        <Field label="Reference" value={trade.referencePrice ?? '—'} highlight />
        <Field label="SL" value={trade.sl ?? '—'} tone="sell" />
        <Field label="TP1" value={trade.tp1 ?? '—'} tone="buy" active={trade.activeTarget === 'TP1'} />
        <Field label="TP2" value={trade.tp2 ?? '—'} tone="buy" active={trade.activeTarget === 'TP2'} />
        <Field label="TP3" value={trade.tp3 ?? '—'} tone="buy" active={trade.activeTarget === 'TP3'} />
      </div>

      {lastPoints != null && (
        <div className="trade-panel__points">
          <span>النقاط</span>
          <strong className={lastPoints >= 0 ? 'positive' : 'negative'}>
            {lastPoints >= 0 ? '+' : ''}
            {lastPoints}
          </strong>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone, active, highlight }) {
  return (
    <div className={`trade-field ${active ? 'trade-field--active' : ''}`}>
      <span className="trade-field__label">{label}</span>
      <span
        className={`trade-field__value ${tone ? `trade-field__value--${tone}` : ''} ${
          highlight ? 'trade-field__value--highlight' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
