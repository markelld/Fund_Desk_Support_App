from collections import defaultdict
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import SystemEvent, Trader
from schemas import AlertItem, DeskSummary, FirmStats, OverviewOut

router = APIRouter()


def _desk_group(desk: str) -> str:
    """'EQ-IDX-2' -> 'EQ-IDX', 'ENRG-1' -> 'ENRG'"""
    parts = desk.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return desk


@router.get("", response_model=OverviewOut)
def get_overview(db: Session = Depends(get_db)):
    traders = db.query(Trader).all()

    # -- firm-wide stats --
    total = len(traders)
    live = sum(1 for t in traders if t.session_status == "live")
    restricted = sum(1 for t in traders if t.risk_state == "restricted")
    flagged = sum(1 for t in traders if t.risk_state == "flagged")
    halted = sum(1 for t in traders if t.risk_state == "halted")

    total_used = sum(t.margin_used for t in traders)
    total_limit = sum(t.margin_limit for t in traders)
    firm_util = round(total_used / total_limit * 100, 1) if total_limit else 0.0

    # -- desk breakdowns first so firm P&L is derived from displayed desk totals --
    groups: dict[str, list[Trader]] = defaultdict(list)
    for t in traders:
        groups[_desk_group(t.desk)].append(t)

    DESK_ORDER = ["EQ-IDX", "ENRG", "MTLS", "FX"]
    desks: List[DeskSummary] = []
    for group in DESK_ORDER:
        members = groups.get(group, [])
        if not members:
            continue
        n = len(members)
        avg_util = round(
            sum(
                t.margin_used / t.margin_limit * 100
                for t in members
                if t.margin_limit
            ) / n,
            1,
        )
        desks.append(
            DeskSummary(
                desk_group=group,
                trader_count=n,
                live_count=sum(1 for t in members if t.session_status == "live"),
                avg_margin_utilization=avg_util,
                restricted_count=sum(1 for t in members if t.risk_state == "restricted"),
                flagged_count=sum(1 for t in members if t.risk_state == "flagged"),
                halted_count=sum(1 for t in members if t.risk_state == "halted"),
                total_realized_pnl=round(sum(t.realized_pnl for t in members), 2),
            )
        )

    # Firm P&L is the exact sum of desk row totals — guarantees reconciliation
    firm_pnl = round(sum(d.total_realized_pnl for d in desks), 2)

    firm = FirmStats(
        total_traders=total,
        live_count=live,
        restricted_count=restricted,
        flagged_count=flagged,
        halted_count=halted,
        firm_margin_utilization=firm_util,
        total_realized_pnl=firm_pnl,
    )

    # -- recent alerts (warning + error, last 24 h) --
    cutoff = datetime(2026, 7, 15) - timedelta(hours=24)
    raw_alerts = (
        db.query(SystemEvent, Trader)
        .join(Trader, SystemEvent.trader_id == Trader.id)
        .filter(
            SystemEvent.severity.in_(["warning", "error"]),
            SystemEvent.timestamp >= cutoff,
        )
        .order_by(SystemEvent.timestamp.desc())
        .limit(20)
        .all()
    )

    alerts: List[AlertItem] = [
        AlertItem(
            id=ev.id,
            trader_id=ev.trader_id,
            trader_name=tr.display_name,
            desk=tr.desk,
            severity=ev.severity,
            category=ev.category,
            message=ev.message,
            timestamp=ev.timestamp,
        )
        for ev, tr in raw_alerts
    ]

    return OverviewOut(firm=firm, desks=desks, recent_alerts=alerts)
