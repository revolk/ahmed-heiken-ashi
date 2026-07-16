import time
import json
import asyncio
import logging
import os
from datetime import datetime, timezone

import MetaTrader5 as mt5
import websockets

SYMBOL = os.environ.get("MT5_SYMBOL", "XAUUSD")
WS_HOST = os.environ.get("PRICEFEED_HOST", "YOUR_SERVER_IP")
WS_PORT = os.environ.get("PRICEFEED_PORT", "8081")
INGEST_SECRET = os.environ.get("PRICEFEED_INGEST_SECRET", "")
WS_URL = f"ws://{WS_HOST}:{WS_PORT}/?channel=ingest&secret={INGEST_SECRET}"

POLL_INTERVAL_SECONDS = 0.5
RECONNECT_DELAY_SECONDS = 3

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("mt5-bridge")


def init_mt5():
    if not mt5.initialize():
        raise RuntimeError(f"فشل الاتصال بـ MT5: {mt5.last_error()}")
    if not mt5.symbol_select(SYMBOL, True):
        raise RuntimeError(f"فشل تفعيل الرمز {SYMBOL}")
    log.info("✅ اتصل بـ MT5 بنجاح، بيراقب %s", SYMBOL)


def get_latest_tick():
    tick = mt5.symbol_info_tick(SYMBOL)
    if tick is None:
        return None
    mid_price = round((tick.bid + tick.ask) / 2, 2)
    timestamp_ms = int(tick.time_msc) if tick.time_msc else int(tick.time * 1000)
    return {"price": mid_price, "timestamp": timestamp_ms}


async def stream_prices():
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
            log.warning("⚠️ انقطع الاتصال (%s) - إعادة محاولة خلال %ss", e, RECONNECT_DELAY_SECONDS)
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
