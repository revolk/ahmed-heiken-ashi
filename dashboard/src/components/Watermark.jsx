import './watermark.css';

const INDICATOR_NAME = import.meta.env.VITE_INDICATOR_NAME || 'Ahmed Heiken Ashi';

/**
 * Watermark.jsx — بند 13: "علامة مائية إلزامية: اسم المؤشر، اسم المشترك،
 * Subscription ID، ويوزر Telegram الخاص بصاحب المشروع."
 */
export default function Watermark({ subscriberName, subscriptionId, ownerTelegramHandle }) {
  return (
    <div className="watermark" aria-hidden="true">
      <span className="watermark__line">{INDICATOR_NAME}</span>
      {subscriberName && <span className="watermark__line">{subscriberName}</span>}
      {subscriptionId && <span className="watermark__line watermark__id">{subscriptionId}</span>}
      {ownerTelegramHandle && <span className="watermark__line">{ownerTelegramHandle}</span>}
    </div>
  );
}
