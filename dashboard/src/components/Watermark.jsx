import './watermark.css';

/**
 * Watermark.jsx — بند 13: "علامة مائية إلزامية: اسم المؤشر، اسم المشترك،
 * Subscription ID، ويوزر Telegram الخاص بصاحب المشروع."
 *
 * ملحوظة أمان: العلامة دي مش مجرد ديكور — هي وسيلة تتبّع لو حصل تسريب
 * للشاشة، فبتتحط بشفافية خفيفة فوق الشارت نفسه (مش في هامش سهل القص).
 */
export default function Watermark({ subscriberName, subscriptionId, ownerTelegramHandle }) {
  return (
    <div className="watermark" aria-hidden="true">
      <span className="watermark__line">Ahmed Heiken Ashi</span>
      {subscriberName && <span className="watermark__line">{subscriberName}</span>}
      {subscriptionId && <span className="watermark__line watermark__id">{subscriptionId}</span>}
      {ownerTelegramHandle && <span className="watermark__line">{ownerTelegramHandle}</span>}
    </div>
  );
}
