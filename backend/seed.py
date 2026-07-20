"""
Seed script — populates desk_support.db with hero traders + ~46 random traders.
Run from backend/: python seed.py
"""
import json
import random
import re
import sys
from datetime import datetime, timedelta

from faker import Faker
from sqlalchemy.orm import Session

sys.path.insert(0, ".")
from database import Base, SessionLocal, engine
from models import Order, OrderEvent, PositionLimit, SystemEvent, Trader

fake = Faker()
Faker.seed(42)
random.seed(42)

_HONORIFICS = re.compile(r"^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Rev\.|Hon\.|Capt\.)\s+")

def trader_name() -> str:
    return _HONORIFICS.sub("", fake.name())

TODAY = datetime(2026, 7, 15, 0, 0, 0)

DESK_SYMBOLS: dict[str, list[str]] = {
    "EQ-IDX": ["MNQ", "MES", "MYM"],
    "ENRG":   ["MCL", "MNG"],
    "MTLS":   ["MGC", "SIL"],
    "FX":     ["M6E", "M6B"],
}

VENUES = ["CME", "ICE"]

REJECT_REASONS = [
    "position_limit_breach",
    "insufficient_margin",
    "connection_lost",
    "outside_trading_hours",
    "risk_limit",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ts(h: int, m: int, s: int, ms: int = 0) -> datetime:
    return TODAY.replace(hour=h, minute=m, second=s, microsecond=ms * 1000)


_used_oids: set[str] = {
    "ord_44e1", "ord_44d8", "ord_44c2", "ord_44b7",
    "ord_3b9f", "ord_3b88", "ord_3b71",
    "ord_7c2a", "ord_7c11", "ord_7bfe",
    "ord_1d85", "ord_1d6c", "ord_1d51", "ord_1d3a",
}


def rand_oid() -> str:
    while True:
        oid = "ord_" + "".join(random.choices("0123456789abcdef", k=6))
        if oid not in _used_oids:
            _used_oids.add(oid)
            return oid


def rand_tid() -> str:
    return "tr_" + "".join(random.choices("0123456789abcdef", k=8))


def _filled_events(order_id: str, submitted_at: datetime, slow_hop: bool = False) -> list[OrderEvent]:
    events = []
    t = submitted_at + timedelta(milliseconds=random.randint(1, 5))

    events.append(OrderEvent(order_id=order_id, seq=1, event_type="received",
                              latency_ms=0, detail="Order accepted from desk terminal",
                              timestamp=t))

    risk_ms = random.randint(8, 25)
    t += timedelta(milliseconds=risk_ms)
    events.append(OrderEvent(order_id=order_id, seq=2, event_type="pre_trade_risk",
                              latency_ms=risk_ms, detail="Risk checks passed",
                              timestamp=t))

    margin_ms = random.randint(5, 15)
    t += timedelta(milliseconds=margin_ms)
    events.append(OrderEvent(order_id=order_id, seq=3, event_type="margin_check",
                              latency_ms=margin_ms, detail="Margin available",
                              timestamp=t))

    route_ms = 780 if slow_hop else random.randint(20, 80)
    detail_route = ("Routed to CME Globex — latency spike detected"
                    if slow_hop else "Order routed to exchange")
    t += timedelta(milliseconds=route_ms)
    events.append(OrderEvent(order_id=order_id, seq=4, event_type="routed_to_venue",
                              latency_ms=route_ms, detail=detail_route,
                              timestamp=t))

    ack_ms = random.randint(30, 80)
    t += timedelta(milliseconds=ack_ms)
    events.append(OrderEvent(order_id=order_id, seq=5, event_type="exchange_ack",
                              latency_ms=ack_ms, detail="Exchange acknowledged order",
                              timestamp=t))

    fill_ms = random.randint(200, 900)
    t += timedelta(milliseconds=fill_ms)
    events.append(OrderEvent(order_id=order_id, seq=6, event_type="fill",
                              latency_ms=fill_ms, detail="Order filled at market",
                              timestamp=t))

    return events


def _rejected_events(order_id: str, submitted_at: datetime,
                     reject_reason: str, at_stage: int = 2) -> list[OrderEvent]:
    """at_stage: 2 = reject at pre_trade_risk, 3 = reject at margin_check"""
    events = []
    t = submitted_at + timedelta(milliseconds=2)

    events.append(OrderEvent(order_id=order_id, seq=1, event_type="received",
                              latency_ms=0, detail="Order accepted from desk terminal",
                              timestamp=t))

    risk_ms = random.randint(8, 500)
    t += timedelta(milliseconds=risk_ms)
    if at_stage == 2:
        events.append(OrderEvent(order_id=order_id, seq=2, event_type="pre_trade_risk",
                                  latency_ms=risk_ms, detail="Running risk checks",
                                  timestamp=t))
        reject_ms = random.randint(1, 5)
        t += timedelta(milliseconds=reject_ms)
        events.append(OrderEvent(order_id=order_id, seq=3, event_type="reject",
                                  latency_ms=reject_ms,
                                  detail=f"Rejected — {reject_reason}",
                                  timestamp=t))
    else:
        events.append(OrderEvent(order_id=order_id, seq=2, event_type="pre_trade_risk",
                                  latency_ms=risk_ms, detail="Risk checks passed",
                                  timestamp=t))
        margin_ms = random.randint(5, 15)
        t += timedelta(milliseconds=margin_ms)
        events.append(OrderEvent(order_id=order_id, seq=3, event_type="margin_check",
                                  latency_ms=margin_ms, detail="Running margin check",
                                  timestamp=t))
        reject_ms = random.randint(1, 5)
        t += timedelta(milliseconds=reject_ms)
        events.append(OrderEvent(order_id=order_id, seq=4, event_type="reject",
                                  latency_ms=reject_ms,
                                  detail=f"Rejected — {reject_reason}",
                                  timestamp=t))
    return events


def _cancelled_events(order_id: str, submitted_at: datetime) -> list[OrderEvent]:
    events = []
    t = submitted_at + timedelta(milliseconds=2)

    events.append(OrderEvent(order_id=order_id, seq=1, event_type="received",
                              latency_ms=0, detail="Order accepted from desk terminal",
                              timestamp=t))
    t += timedelta(milliseconds=18)
    events.append(OrderEvent(order_id=order_id, seq=2, event_type="pre_trade_risk",
                              latency_ms=18, detail="Risk checks passed", timestamp=t))
    t += timedelta(milliseconds=11)
    events.append(OrderEvent(order_id=order_id, seq=3, event_type="margin_check",
                              latency_ms=11, detail="Margin available", timestamp=t))
    t += timedelta(milliseconds=44)
    events.append(OrderEvent(order_id=order_id, seq=4, event_type="routed_to_venue",
                              latency_ms=44, detail="Order routed to CME", timestamp=t))
    t += timedelta(milliseconds=2900)
    events.append(OrderEvent(order_id=order_id, seq=5, event_type="cancel",
                              latency_ms=2900,
                              detail="Cancelled — desk connection lost before exchange ack",
                              timestamp=t))
    return events


# ---------------------------------------------------------------------------
# Hero traders
# ---------------------------------------------------------------------------

def seed_heroes(db: Session) -> None:

    # ------------------------------------------------------------------
    # Hero 1 — M. Reyes — position limit breach, restricted
    # ------------------------------------------------------------------
    reyes = Trader(
        id="tr_8f21c94b",
        display_name="Miguel Reyes",
        email="m.reyes@firm.com",
        desk="EQ-IDX-2",
        risk_state="restricted",
        session_status="live",
        realized_pnl=-18_420.0,
        unrealized_pnl=-4_100.0,
        permissioned_symbols=json.dumps(["MNQ", "MES", "MYM"]),
        margin_used=470_000.0,
        margin_limit=500_000.0,
        maintenance_margin=412_000.0,
        aggregate_position_limit=60,
        created_at=TODAY - timedelta(days=120),
    )
    db.add(reyes)

    for sym, cur, lim in [("MNQ", 30, 40), ("MES", 20, 25), ("MYM", 7, 15)]:
        db.add(PositionLimit(trader_id="tr_8f21c94b", symbol=sym,
                              current_qty=cur, limit_qty=lim))

    # Most recent rejected order — the hero order
    o1 = Order(
        id="ord_44e1",
        trader_id="tr_8f21c94b",
        symbol="MNQ", side="buy", order_type="market",
        qty=10, venue="CME", limit_price=None,
        status="rejected", reject_reason="position_limit_breach",
        submitted_at=ts(10, 14, 22),
        resolved_at=ts(10, 14, 22, 492),
    )
    db.add(o1)
    db.add(OrderEvent(order_id="ord_44e1", seq=1, event_type="received",
                       latency_ms=0, detail="Order accepted from desk terminal EQ-IDX-2",
                       timestamp=ts(10, 14, 22, 4)))
    db.add(OrderEvent(order_id="ord_44e1", seq=2, event_type="pre_trade_risk",
                       latency_ms=486, detail="Checking position limits, permissions, price collar",
                       timestamp=ts(10, 14, 22, 490)))
    db.add(OrderEvent(order_id="ord_44e1", seq=3, event_type="reject",
                       latency_ms=2,
                       detail="position_limit_breach — MNQ 30 + 10 = 40 (limit 40); aggregate 67 > 60",
                       timestamp=ts(10, 14, 22, 492)))

    # A few earlier orders — filled
    for oid, sym, side, otype, qty, lp, sub_h, sub_m, sub_s in [
        ("ord_44d8", "MES", "sell", "limit", 5,  None,    10, 2,  14),
        ("ord_44c2", "MNQ", "buy",  "limit", 15, 19_840.0, 9, 41, 7),
        ("ord_44b7", "MYM", "buy",  "market", 3,  None,    8, 57, 19),
    ]:
        sub = ts(sub_h, sub_m, sub_s)
        status = "partially_filled" if oid == "ord_44b7" else "filled"
        o = Order(id=oid, trader_id="tr_8f21c94b",
                  symbol=sym, side=side, order_type=otype,
                  qty=qty, venue="CME", limit_price=lp,
                  status=status, reject_reason=None,
                  submitted_at=sub,
                  resolved_at=sub + timedelta(milliseconds=random.randint(500, 2000)))
        db.add(o)
        for ev in _filled_events(oid, sub):
            db.add(ev)

    # System events (reverse chron order in DB — API sorts desc)
    for sev, cat, msg, h, m, s in [
        ("error",   "risk",    "Trader restricted — MNQ position limit reached",            10, 14, 22),
        ("error",   "risk",    "Order ord_44e1 rejected — position_limit_breach",           10, 14, 22),
        ("warning", "risk",    "Margin utilization crossed 90% — risk mgr notified",        10,  9, 41),
        ("warning", "risk",    "MNQ limit lowered 60 → 40 by risk manager",                  9,  2, 15),
        ("info",    "session", "Trader logged in — desk terminal EQ-IDX-2",                  7, 48,  3),
    ]:
        db.add(SystemEvent(trader_id="tr_8f21c94b", severity=sev, category=cat,
                            message=msg, timestamp=ts(h, m, s)))

    # ------------------------------------------------------------------
    # Hero 2 — D. Howell — slow fill (routing latency spike)
    # ------------------------------------------------------------------
    howell = Trader(
        id="tr_2b19af72",
        display_name="Diane Howell",
        email="d.howell@firm.com",
        desk="EQ-IDX-1",
        risk_state="active",
        session_status="live",
        realized_pnl=6_180.0,
        unrealized_pnl=920.0,
        permissioned_symbols=json.dumps(["MNQ", "MES"]),
        margin_used=205_000.0,
        margin_limit=500_000.0,
        maintenance_margin=178_000.0,
        aggregate_position_limit=60,
        created_at=TODAY - timedelta(days=200),
    )
    db.add(howell)
    for sym, cur, lim in [("MNQ", 8, 40), ("MES", 14, 25)]:
        db.add(PositionLimit(trader_id="tr_2b19af72", symbol=sym,
                              current_qty=cur, limit_qty=lim))

    # Hero order — filled but with slow routing hop
    o2 = Order(
        id="ord_3b9f",
        trader_id="tr_2b19af72",
        symbol="MES", side="buy", order_type="limit",
        qty=5, venue="CME", limit_price=5_420.00,
        status="filled", reject_reason=None,
        submitted_at=ts(9, 15, 33),
        resolved_at=ts(9, 15, 35, 180),
    )
    db.add(o2)
    db.add(OrderEvent(order_id="ord_3b9f", seq=1, event_type="received",
                       latency_ms=0, detail="Order accepted from desk terminal EQ-IDX-1",
                       timestamp=ts(9, 15, 33, 12)))
    db.add(OrderEvent(order_id="ord_3b9f", seq=2, event_type="pre_trade_risk",
                       latency_ms=12, detail="Risk checks passed",
                       timestamp=ts(9, 15, 33, 24)))
    db.add(OrderEvent(order_id="ord_3b9f", seq=3, event_type="margin_check",
                       latency_ms=8, detail="Margin available — $14,200 remaining",
                       timestamp=ts(9, 15, 33, 32)))
    db.add(OrderEvent(order_id="ord_3b9f", seq=4, event_type="routed_to_venue",
                       latency_ms=780,
                       detail="Routed to CME Globex — latency spike detected on this hop",
                       timestamp=ts(9, 15, 33, 812)))
    db.add(OrderEvent(order_id="ord_3b9f", seq=5, event_type="exchange_ack",
                       latency_ms=45, detail="Exchange acknowledged order",
                       timestamp=ts(9, 15, 33, 857)))
    db.add(OrderEvent(order_id="ord_3b9f", seq=6, event_type="fill",
                       latency_ms=1323, detail="5 contracts filled at 5420.00",
                       timestamp=ts(9, 15, 35, 180)))

    # A few more normal orders
    for oid, sym, side, qty, sub_h, sub_m, sub_s in [
        ("ord_3b88", "MNQ", "buy",  4, 8, 44, 11),
        ("ord_3b71", "MES", "sell", 3, 8, 10, 55),
    ]:
        sub = ts(sub_h, sub_m, sub_s)
        o = Order(id=oid, trader_id="tr_2b19af72",
                  symbol=sym, side=side, order_type="market",
                  qty=qty, venue="CME", limit_price=None,
                  status="filled", reject_reason=None,
                  submitted_at=sub,
                  resolved_at=sub + timedelta(milliseconds=random.randint(400, 1200)))
        db.add(o)
        for ev in _filled_events(oid, sub):
            db.add(ev)

    db.add(SystemEvent(trader_id="tr_2b19af72", severity="warning", category="venue",
                        message="CME Globex routing latency spike: 780ms (threshold: 500ms) — ord_3b9f",
                        timestamp=ts(9, 15, 33, 812)))
    db.add(SystemEvent(trader_id="tr_2b19af72", severity="info", category="session",
                        message="Trader logged in — desk terminal EQ-IDX-1",
                        timestamp=ts(8, 30, 0)))

    # ------------------------------------------------------------------
    # Hero 3 — R. Ortega — disconnect, cancelled order
    # ------------------------------------------------------------------
    ortega = Trader(
        id="tr_5e4dc831",
        display_name="Ray Ortega",
        email="r.ortega@firm.com",
        desk="ENRG-1",
        risk_state="flagged",
        session_status="live",
        realized_pnl=-2_940.0,
        unrealized_pnl=-610.0,
        permissioned_symbols=json.dumps(["MCL", "MNG"]),
        margin_used=390_000.0,
        margin_limit=500_000.0,
        maintenance_margin=341_000.0,
        aggregate_position_limit=40,
        created_at=TODAY - timedelta(days=85),
    )
    db.add(ortega)
    for sym, cur, lim in [("MCL", 12, 20), ("MNG", 6, 15)]:
        db.add(PositionLimit(trader_id="tr_5e4dc831", symbol=sym,
                              current_qty=cur, limit_qty=lim))

    # Hero order — cancelled due to connection loss
    o3 = Order(
        id="ord_7c2a",
        trader_id="tr_5e4dc831",
        symbol="MCL", side="sell", order_type="market",
        qty=8, venue="CME", limit_price=None,
        status="cancelled", reject_reason="connection_lost",
        submitted_at=ts(9, 45, 12),
        resolved_at=ts(9, 45, 15),
    )
    db.add(o3)
    for ev in _cancelled_events("ord_7c2a", ts(9, 45, 12)):
        db.add(ev)

    for oid, sym, side, qty, sub_h, sub_m, sub_s in [
        ("ord_7c11", "MCL", "buy",  5, 9, 22, 44),
        ("ord_7bfe", "MNG", "buy",  3, 8, 51, 7),
    ]:
        sub = ts(sub_h, sub_m, sub_s)
        o = Order(id=oid, trader_id="tr_5e4dc831",
                  symbol=sym, side=side, order_type="market",
                  qty=qty, venue="CME", limit_price=None,
                  status="filled", reject_reason=None,
                  submitted_at=sub,
                  resolved_at=sub + timedelta(milliseconds=random.randint(400, 1100)))
        db.add(o)
        for ev in _filled_events(oid, sub):
            db.add(ev)

    for sev, cat, msg, h, m, s in [
        ("warning", "session", "Desk terminal ENRG-1 reconnected",                     9, 48, 22),
        ("error",   "venue",   "Order ord_7c2a cancelled — connection lost before ack", 9, 45, 15),
        ("error",   "session", "Desk terminal ENRG-1 disconnected — connection_lost",   9, 45, 12),
        ("warning", "risk",    "Margin utilization crossed 78% — flagging account",     9, 30,  5),
        ("info",    "session", "Trader logged in — desk terminal ENRG-1",               8,  0,  0),
    ]:
        db.add(SystemEvent(trader_id="tr_5e4dc831", severity=sev, category=cat,
                            message=msg, timestamp=ts(h, m, s)))

    # ------------------------------------------------------------------
    # Hero 4 — P. Nair — healthy, all green
    # ------------------------------------------------------------------
    nair = Trader(
        id="tr_f7a83c20",
        display_name="Priya Nair",
        email="p.nair@firm.com",
        desk="MTLS-1",
        risk_state="active",
        session_status="live",
        realized_pnl=11_340.0,
        unrealized_pnl=2_200.0,
        permissioned_symbols=json.dumps(["MGC", "SIL"]),
        margin_used=95_000.0,
        margin_limit=500_000.0,
        maintenance_margin=83_000.0,
        aggregate_position_limit=40,
        created_at=TODAY - timedelta(days=310),
    )
    db.add(nair)
    for sym, cur, lim in [("MGC", 5, 20), ("SIL", 3, 15)]:
        db.add(PositionLimit(trader_id="tr_f7a83c20", symbol=sym,
                              current_qty=cur, limit_qty=lim))

    for oid, sym, side, qty, lp, sub_h, sub_m, sub_s in [
        ("ord_1d85", "MGC", "buy",  12, 2_341.0, 10, 22, 44),
        ("ord_1d6c", "SIL", "sell",  5, None,     9, 55, 18),
        ("ord_1d51", "MGC", "buy",   8, 2_330.0,  9, 14,  3),
        ("ord_1d3a", "SIL", "buy",   4, None,     8, 42, 50),
    ]:
        sub = ts(sub_h, sub_m, sub_s)
        o = Order(id=oid, trader_id="tr_f7a83c20",
                  symbol=sym, side=side,
                  order_type="limit" if lp else "market",
                  qty=qty, venue="CME", limit_price=lp,
                  status="filled", reject_reason=None,
                  submitted_at=sub,
                  resolved_at=sub + timedelta(milliseconds=random.randint(350, 900)))
        db.add(o)
        for ev in _filled_events(oid, sub):
            db.add(ev)

    db.add(SystemEvent(trader_id="tr_f7a83c20", severity="info", category="session",
                        message="Trader logged in — desk terminal MTLS-1",
                        timestamp=ts(8, 15, 0)))
    db.add(SystemEvent(trader_id="tr_f7a83c20", severity="info", category="risk",
                        message="Daily PnL target reached — +$11,340 realized",
                        timestamp=ts(10, 22, 44)))


# ---------------------------------------------------------------------------
# Random traders
# ---------------------------------------------------------------------------

DESKS = [
    ("EQ-IDX", ["EQ-IDX-1", "EQ-IDX-2", "EQ-IDX-3"]),
    ("ENRG",   ["ENRG-1", "ENRG-2"]),
    ("MTLS",   ["MTLS-1", "MTLS-2"]),
    ("FX",     ["FX-1", "FX-2"]),
]

RISK_STATES = ["active"] * 7 + ["flagged"] * 2 + ["restricted"] * 1
SESSION_STATES = ["live"] * 8 + ["offline"] * 2


def seed_random(db: Session, count: int = 46) -> None:
    for i in range(count):
        tid = rand_tid()
        desk_group, desk_ids = random.choice(DESKS)
        desk = random.choice(desk_ids)
        symbols = DESK_SYMBOLS[desk_group]

        risk_state = random.choice(RISK_STATES)
        session_status = random.choice(SESSION_STATES)

        margin_limit = random.choice([300_000, 400_000, 500_000])
        util_pct = random.uniform(0.10, 0.95)
        margin_used = round(margin_limit * util_pct, 2)
        maintenance_margin = round(margin_used * random.uniform(0.82, 0.92), 2)

        realized_pnl = round(random.uniform(-25_000, 30_000), 2)
        unrealized_pnl = round(random.uniform(-5_000, 8_000), 2)

        agg_limit = random.choice([40, 60, 80])

        trader = Trader(
            id=tid,
            display_name=trader_name(),
            email=fake.email(),
            desk=desk,
            risk_state=risk_state,
            session_status=session_status,
            realized_pnl=realized_pnl,
            unrealized_pnl=unrealized_pnl,
            permissioned_symbols=json.dumps(symbols),
            margin_used=margin_used,
            margin_limit=margin_limit,
            maintenance_margin=maintenance_margin,
            aggregate_position_limit=agg_limit,
            created_at=TODAY - timedelta(days=random.randint(10, 400)),
        )
        db.add(trader)

        per_limit = agg_limit // len(symbols)
        for sym in symbols:
            cur = random.randint(0, per_limit)
            db.add(PositionLimit(trader_id=tid, symbol=sym,
                                  current_qty=cur, limit_qty=per_limit))

        # Orders
        num_orders = random.randint(5, 18)
        reject_indices = set(random.sample(range(num_orders), k=min(3, num_orders)))

        for j in range(num_orders):
            oid = rand_oid()
            sym = random.choice(symbols)
            side = random.choice(["buy", "sell"])
            otype = random.choice(["market", "market", "limit", "stop"])
            qty = random.randint(1, 20)
            lp = round(random.uniform(500, 25_000), 2) if otype in ("limit", "stop") else None

            offset_hours = random.uniform(0, 8)
            sub = TODAY.replace(hour=7) + timedelta(hours=offset_hours)

            if j in reject_indices:
                reason = random.choice(REJECT_REASONS)
                at_stage = random.choice([2, 2, 3])
                status = "rejected"
                res = sub + timedelta(milliseconds=random.randint(10, 600))
                o = Order(id=oid, trader_id=tid, symbol=sym, side=side,
                          order_type=otype, qty=qty, venue=random.choice(VENUES),
                          limit_price=lp, status=status, reject_reason=reason,
                          submitted_at=sub, resolved_at=res)
                db.add(o)
                for ev in _rejected_events(oid, sub, reason, at_stage):
                    db.add(ev)
            else:
                res = sub + timedelta(milliseconds=random.randint(300, 2000))
                o = Order(id=oid, trader_id=tid, symbol=sym, side=side,
                          order_type=otype, qty=qty, venue=random.choice(VENUES),
                          limit_price=lp, status="filled", reject_reason=None,
                          submitted_at=sub, resolved_at=res)
                db.add(o)
                for ev in _filled_events(oid, sub):
                    db.add(ev)

        # System events — realistic trading desk messages
        SYSTEM_EVENT_TEMPLATES = [
            ("info",    "session", "Trader logged in — desk terminal {desk}"),
            ("info",    "session", "Trader logged out — session closed normally"),
            ("info",    "session", "Trader reconnected after brief disconnect"),
            ("info",    "risk",    "Daily P&L target reached — position review recommended"),
            ("info",    "risk",    "Margin utilization below 30% — buying power available"),
            ("info",    "venue",   "CME Globex connectivity nominal — latency {lat}ms"),
            ("info",    "auth",    "Password reset completed — new session started"),
            ("warning", "risk",    "Margin utilization crossed 70% — monitoring"),
            ("warning", "risk",    "Margin utilization crossed 80% — risk mgr notified"),
            ("warning", "risk",    "Daily loss limit at 60% — approaching threshold"),
            ("warning", "risk",    "{sym} position at 75% of limit — approaching cap"),
            ("warning", "venue",   "CME Globex routing latency elevated: {lat}ms (threshold: 500ms)"),
            ("warning", "venue",   "ICE connectivity degraded — failover route active"),
            ("warning", "session", "Idle session warning — no orders in 90 minutes"),
            ("warning", "auth",    "Login attempt from unrecognized IP — access granted after MFA"),
            ("error",   "risk",    "Order rejected — position_limit_breach on {sym}"),
            ("error",   "risk",    "Order rejected — insufficient_margin for {sym} order"),
            ("error",   "risk",    "Daily loss limit breached — trading suspended"),
            ("error",   "venue",   "CME order gateway timeout — order status unknown"),
            ("error",   "session", "Desk terminal {desk} disconnected unexpectedly"),
            ("error",   "auth",    "Repeated login failures — account temporarily locked"),
        ]
        num_sevents = random.randint(2, 6)
        for _ in range(num_sevents):
            sev_cat_msg = random.choice(SYSTEM_EVENT_TEMPLATES)
            sev, cat, msg_tpl = sev_cat_msg
            sym = random.choice(symbols)
            msg = (msg_tpl
                   .replace("{desk}", desk)
                   .replace("{sym}", sym)
                   .replace("{lat}", str(random.randint(520, 950))))
            h = random.randint(7, 15)
            m = random.randint(0, 59)
            s = random.randint(0, 59)
            db.add(SystemEvent(
                trader_id=tid, severity=sev, category=cat,
                message=msg,
                timestamp=TODAY.replace(hour=h, minute=m, second=s),
            ))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    print("Dropping and recreating tables…")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("Seeding hero traders…")
        seed_heroes(db)
        print("Seeding random traders…")
        seed_random(db, count=46)
        db.commit()
        print("Done. Database ready.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
