import { useState, useEffect } from 'react';
import TradeChart from './components/TradeChart';
import TradeInfoPanel from './components/TradeInfoPanel';
import SignalBadge from './components/SignalBadge';
import Watermark from './components/Watermark';
import { useLiveFeed } from './hooks/useLiveFeed';
import { useAuth } from './hooks/useAuth';
import './styles/tokens.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const PRICEFEED_WS_BASE = import.meta.env.VITE_PRICEFEED_WS_URL || '';
const OWNER_TELEGRAM_HANDLE = import.meta.env.VITE_OWNER_TELEGRAM_HANDLE || '';
const INDICATOR_NAME = import.meta.env.VITE_INDICATOR_NAME || 'Ahmed Heiken Ashi';

export default function App() {
  useEffect(() => {
    document.title = INDICATOR_NAME;
  }, []);

  const accessToken = new URLSearchParams(window.location.search).get('token') || '';

  const { subscriber, error: authError, loading: authLoading } = useAuth({
    apiBaseUrl: API_BASE_URL,
    accessToken,
  });

  const wsUrl =
    subscriber && PRICEFEED_WS_BASE
      ? `${PRICEFEED_WS_BASE}?channel=subscribe&token=${accessToken}&deviceId=${subscriber.deviceId}`
      : '';

  const { connected, activeTrade, badges, dismissBadge } = useLiveFeed(wsUrl);
  const [candles] = useState([]);

  if (authLoading) return <CenteredMessage text="جاري التحقق من التصريح..." />;
  if (authError) return <CenteredMessage text="مفيش تصريح صالح - راجع الرابط أو تواصل مع صاحب المؤشر" isError />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{INDICATOR_NAME}</h1>
        <span className={`connection-dot ${connected ? 'connection-dot--live' : ''}`}>
          {connected ? 'متصل' : 'جاري الاتصال...'}
        </span>
      </header>

      <main className="app-main">
        <section className="chart-area">
          <Watermark
            subscriberName={subscriber?.displayName}
            subscriptionId={subscriber?.subscriptionId}
            ownerTelegramHandle={OWNER_TELEGRAM_HANDLE}
          />
          <TradeChart candles={candles} trade={activeTrade} />
        </section>
        <aside className="side-panel">
          <TradeInfoPanel trade={activeTrade} />
        </aside>
      </main>

      <div className="badge-stack">
        {badges.map((b) => (
          <SignalBadge key={b.id} label={b.label} tone={b.tone} onDismiss={() => dismissBadge(b.id)} />
        ))}
      </div>
    </div>
  );
}

function CenteredMessage({ text, isError }) {
  return (
    <div className="centered-message" style={{ color: isError ? 'var(--sell-red)' : 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
