"""
mt5-bridge/price_bridge.py

الجسر بين منصة MT5 وسيرفر الأسعار (priceFeedServer.js).
لازم يتشغّل على جهاز فيه Windows (مكتبة MetaTrader5 الرسمية شغالة على
Windows بس)، سواء VPS ويندوز صغير أو حتى جهاز شخصي شغال باستمرار.

الفكرة:
  MT5 Terminal (على نفس الجهاز) → مكتبة MetaTrader5 (بايثون) → WebSocket → priceFeedServer.js

الإعداد قبل التشغيل:
  1) تثبيت منصة MetaTrader5 (من أي بروكر، حتى حساب Demo مجاني كفاية تمامًا لقراءة الأسعار)
  2) تسجيل الدخول مرة واحدة في التطبيق نفسه وتفعيل "Algo Trading"
  3) pip install -r requirements.txt
  4) ضبط المتغيرات تحت (SYMBOL, WS_URL, INGEST_SECRET)

التشغيل: python price_bridge.py
"""

import time
import json
import asyncio
import logging
from datetime import datetime, timezone

import MetaTrader5 as mt5
import websockets

# ---------- الإعدادات ----------

SYMBOL = "XAUUSD"          # ملحوظة: الاسم بالظبط ممكن يختلف شوية حسب البروكر (مثلاً XAUUSD.m أو GOLD)
WS_URL = "ws://YOUR_SERVER_IP:8081/?channel=ingest&secret=YOUR_INGEST_SECRET"
POLL_INTERVAL_SECONDS = 0.5   # نصف ثانية عشان نلحق هدف بند 11 (0-1 ثانية)
RECONNECT_DELAY_SECONDS = 3

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("mt5-bridge")


def init_mt5():
    """يفتح اتصال مع تطبيق MT5 المثبت على نفس الجهاز."""
    if not mt5.initialize():
        raise RuntimeError(f"فشل الاتصال بـ MT5: {mt5.last_error()}")
    if not mt5.symbol_select(SYMBOL, True):
        raise RuntimeError(f"فشل تفعيل الرمز {SYMBOL} - تأكد إن اسم الرمز مطابق لاسمه عند البروكر")
    log.info("✅ اتصل بـ MT5 بنجاح، بيراقب %s", SYMBOL)


def get_latest_tick():
    """
    بيرجع آخر سعر لحظي (Tick) حقيقي من MT5.
    بنستخدم منتصف الفرق بين البيع والشراء (Bid/Ask) كسعر مرجعي موحّد،
    عشان يطابق الأسعار اللي القنوات بتكتبها عادةً.
    """
    tick = mt5.symbol_info_tick(SYMBOL)
    if tick is None:
        return None
    mid_price = round((tick.bid + tick.ask) / 2, 2)
    timestamp_ms = int(tick.time_msc) if tick.time_msc else int(tick.time * 1000)
    return {"price": mid_price, "timestamp": timestamp_ms}


async def stream_prices():
    """الحلقة الرئيسية: تتصل بالسيرفر، وتبعت تيك جديد كل ما يتغيّر السعر."""
    last_sent_price = None

    while True:
        try:
            async with websockets.connect(WS_URL, ping_interval=20, ping_timeout=10) as ws:
                log.info("✅ اتصل بسيرفر الأسعار")

                while True:
                    tick = get_latest_tick()
                    if tick and tick["price"] != last_sent_price:
                        await ws.send(json.dumps(tick))
                        last_sent_price = tick["price"]
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)

        except (websockets.ConnectionClosed, OSError) as e:
            log.warning("⚠️ انقطع الاتصال بسيرفر الأسعار (%s) - إعادة محاولة خلال %ss", e, RECONNECT_DELAY_SECONDS)
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)
        except Exception as e:
            log.error("❌ خطأ غير متوقع: %s", e)
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)


if __name__ == "__main__":
    init_mt5()
    try:
        asyncio.run(stream_prices())
    except KeyboardInterrupt:
        log.info("تم إيقاف الجسر يدويًا")
    finally:
        mt5.shutdown()
