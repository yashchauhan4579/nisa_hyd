#!/usr/bin/env python3
# Transparent TCP forwarder: 0.0.0.0:8080 -> 127.0.0.1:8010 (forensics adapter).
# 8010 is firewall-blocked from other hosts; 8080 is allowed. Passes HTTP, MJPEG
# and websockets byte-for-byte so the IRIS Observer (on 219) can reach it.
import asyncio
SRC_HOST, SRC_PORT = "0.0.0.0", 8080
DST_HOST, DST_PORT = "127.0.0.1", 8010

async def pipe(r, w):
    try:
        while True:
            d = await r.read(65536)
            if not d: break
            w.write(d); await w.drain()
    except Exception: pass
    finally:
        try: w.close()
        except Exception: pass

async def handle(cr, cw):
    try:
        sr, sw = await asyncio.open_connection(DST_HOST, DST_PORT)
    except Exception:
        try: cw.close()
        except Exception: pass
        return
    await asyncio.gather(pipe(cr, sw), pipe(sr, cw))

async def main():
    s = await asyncio.start_server(handle, SRC_HOST, SRC_PORT)
    print(f"forwarding {SRC_HOST}:{SRC_PORT} -> {DST_HOST}:{DST_PORT}", flush=True)
    async with s:
        await s.serve_forever()

asyncio.run(main())
