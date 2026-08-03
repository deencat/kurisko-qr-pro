#!/usr/bin/env python3
"""JSON-stdin bridge for Futu OpenD trade: max_sell_short + place_order.

Input example:
  {"action":"max_sell_short","symbol":"US.AAPL","price":150,"host":"127.0.0.1","port":11111}
  {"action":"place","symbol":"US.AAPL","price":150,"qty":10,"side":"short","trd_env":"SIMULATE"}
"""

from __future__ import annotations

import json
import os
import sys


def main() -> int:
    try:
        raw = sys.stdin.read()
        req = json.loads(raw)
    except Exception as e:
        print(json.dumps({"ok": False, "message": f"bad_json:{e}"}))
        return 1

    host = req.get("host") or os.environ.get("FUTU_OPEND_HOST", "127.0.0.1")
    port = int(req.get("port") or os.environ.get("FUTU_OPEND_PORT", "11111"))
    action = req.get("action")

    try:
        from futu import (
            RET_OK,
            OpenSecTradeContext,
            OrderType,
            TrdEnv,
            TrdMarket,
            TrdSide,
        )
    except Exception as e:
        print(json.dumps({"ok": False, "message": f"futu_import:{e}"}))
        return 1

    trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host=host, port=port)
    try:
        if action == "max_sell_short":
            symbol = req["symbol"]
            price = float(req["price"])
            ret, data = trd_ctx.get_max_trd_qtys(
                order_type=OrderType.NORMAL, code=symbol, price=price
            )
            if ret != RET_OK:
                print(json.dumps({"ok": False, "message": str(data)}))
                return 1
            max_ss = float(data["max_sell_short"].iloc[0]) if hasattr(data["max_sell_short"], "iloc") else float(data["max_sell_short"][0])
            print(json.dumps({"ok": True, "max_sell_short": max_ss, "message": "ok"}))
            return 0

        if action == "place":
            symbol = req["symbol"]
            price = float(req["price"])
            qty = float(req["qty"])
            side = req.get("side", "short")
            env = TrdEnv.SIMULATE if str(req.get("trd_env", "SIMULATE")).upper() != "REAL" else TrdEnv.REAL
            trd_side = TrdSide.SELL_SHORT if side == "short" else TrdSide.BUY_BACK
            ret, data = trd_ctx.place_order(
                price=price,
                qty=qty,
                code=symbol,
                trd_side=trd_side,
                order_type=OrderType.NORMAL,
                trd_env=env,
            )
            if ret != RET_OK:
                print(json.dumps({"ok": False, "message": str(data)}))
                return 1
            order_id = data["order_id"].iloc[0] if hasattr(data["order_id"], "iloc") else data["order_id"][0]
            print(json.dumps({"ok": True, "order_id": str(order_id), "message": "placed"}))
            return 0

        print(json.dumps({"ok": False, "message": f"unknown_action:{action}"}))
        return 1
    except Exception as e:
        print(json.dumps({"ok": False, "message": str(e)}))
        return 1
    finally:
        trd_ctx.close()


if __name__ == "__main__":
    raise SystemExit(main())
