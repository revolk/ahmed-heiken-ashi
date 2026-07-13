import { useEffect, useRef, useState } from 'react';

/**
 * useLiveFeed.js
 * يتصل بقناة "subscribe" في priceFeedServer.js، ويستقبل كل حدث لحظي
 * (تحديث صفقة، شارة جديدة). بيحاول يعيد الاتصال تلقائيًا عند الانقطاع.
 *
 * @param {string} wsUrl - رابط WebSocket، مثال: wss://your-domain.com/?channel=subscribe&token=...
 */
export function useLiveFeed(wsUrl) {
  const [connected, setConnected] = useState(false);
  const [activeTrade, setActiveTrade] = useState(null);
  const [badges, setBadges] = useState([]); // [{ id, label, tone }]
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!wsUrl) return;
    let cancelled = false;

    function connect() {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => !cancelled && setConnected(true);

      socket.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        // إعادة محاولة كل 3 ثواني - مهم لأن الاستقرار جزء من متطلبات بند 14
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handlePayload(payload);
        } catch {
          // رسالة مش JSON صالحة، نتجاهلها بأمان
        }
      };
    }

    function handlePayload(payload) {
      const { commands = [], badges: newBadges = [] } = payload;

      for (const cmd of commands) {
        if (cmd.action === 'CREATE_TRADE' || cmd.action === 'UPDATE_TRADE' || cmd.action === 'DRAW_CHART_LEVELS') {
          setActiveTrade(cmd.trade);
        }
        if (cmd.action === 'ARCHIVE_TRADE') {
          setActiveTrade(null);
        }
      }

      if (newBadges.length) {
        setBadges((prev) => [
          ...prev,
          ...newBadges.map((label) => ({ id: `${Date.now()}-${label}`, label, tone: toneFromLabel(label) })),
        ]);
      }
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [wsUrl]);

  function dismissBadge(id) {
    setBadges((prev) => prev.filter((b) => b.id !== id));
  }

  return { connected, activeTrade, badges, dismissBadge };
}

function toneFromLabel(label) {
  if (label.includes('BUY')) return 'buy';
  if (label.includes('SELL')) return 'sell';
  if (label.includes('PROFIT') || label.includes('HIT SUCCESSFULLY')) return 'profit';
  if (label.includes('SL') || label.includes('LOSS') || label.includes('CANCELLED')) return 'loss';
  return 'neutral';
}
