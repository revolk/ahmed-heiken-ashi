import { useEffect, useState } from 'react';
import './signalBadge.css';

/**
 * SignalBadge.jsx — العنصر البصري المميز (Signature Element) في الواجهة.
 *
 * الفكرة: كل حدث مؤكد (BUY NOW، TP1 HIT، BREAK EVEN...) يظهر كـ"ختم" رسمي
 * بيدخل بحركة سريعة زي ختم الموافقة على تذكرة تداول حقيقية، بدل toast notification
 * عادي. ده بيرجّع لإحساس "توصية رسمية مؤكدة" اللي هو جوهر المؤشر كله،
 * وبيفرّق بصريًا بين حدث مهم لازم تاخد باله فورًا وبين تحديث عادي في الخلفية.
 *
 * @param {string} label - نص الشارة، مثال: "BUY NOW" أو "TP1 HIT SUCCESSFULLY"
 * @param {'buy'|'sell'|'profit'|'loss'|'neutral'} tone
 * @param {number} durationMs - مدة ظهور الشارة قبل ما تختفي (افتراضي 6 ثواني)
 */
export default function SignalBadge({ label, tone = 'neutral', durationMs = 6000, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <div className={`stamp-badge stamp-badge--${tone}`} role="status">
      <span className="stamp-badge__ring" />
      <span className="stamp-badge__label">{label}</span>
    </div>
  );
}
