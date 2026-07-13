import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

/**
 * TradeChart.jsx
 *
 * الشارت الرئيسي - بند 10 من الوثيقة:
 * "منطقة الدخول مظللة، وخطوط ENTRY وSL وTP وBREAK EVEN. أثناء الصفقة تمتد
 * الخطوط حتى نهايتها؛ بعدها تتوقف عند شمعة الإغلاق وتبقى تاريخيًا دون تشويش."
 *
 * @param {object[]} candles - بيانات الشموع: [{ time, open, high, low, close }]
 * @param {object|null} trade - الصفقة الفعالة حاليًا (نفس شكل كائن trade من tradeStateMachine)
 */
export default function TradeChart({ candles = [], trade = null }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);

  // إنشاء الشارت مرة واحدة بس
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b92a3',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1c212c' },
        horzLines: { color: '#1c212c' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#262c3a' },
      timeScale: { borderColor: '#262c3a', timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#4ade80',
      downColor: '#f0533d',
      borderVisible: false,
      wickUpColor: '#4ade80',
      wickDownColor: '#f0533d',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => chart.remove();
  }, []);

  // تحديث بيانات الشموع
  useEffect(() => {
    if (seriesRef.current && candles.length) {
      seriesRef.current.setData(candles);
    }
  }, [candles]);

  // رسم خطوط الصفقة الفعالة (Entry / SL / TP1-3 / Break Even) - بند 10
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // نشيل الخطوط القديمة قبل ما نرسم الجديدة (تجنب تراكم عند تغيير الصفقة)
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];

    if (!trade) return;

    const addLine = (price, color, title, style = 0) => {
      if (price == null) return;
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style, // 0 = خط متصل، 2 = متقطع
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    // منطقة الدخول - خطين متقطعين بلون الذهب يحددان الحافة العليا والسفلى
    if (trade.entryZone?.length === 2) {
      addLine(trade.entryZone[0], '#c9a961', 'ENTRY', 2);
      addLine(trade.entryZone[1], '#c9a961', 'ENTRY', 2);
    } else if (trade.entryZone?.length === 1) {
      addLine(trade.entryZone[0], '#c9a961', 'ENTRY', 2);
    }

    addLine(trade.sl, '#f0533d', 'SL');
    addLine(trade.tp1, '#4ade80', 'TP1', trade.activeTarget === 'TP1' ? 0 : 2);
    addLine(trade.tp2, '#4ade80', 'TP2', trade.activeTarget === 'TP2' ? 0 : 2);
    addLine(trade.tp3, '#4ade80', 'TP3', trade.activeTarget === 'TP3' ? 0 : 2);

    if (trade.breakEvenActivated && !trade.breakEvenHit) {
      addLine(trade.breakEvenLevel, '#f5b942', 'BREAK EVEN', 2);
    }
  }, [trade]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 420 }} />;
}
