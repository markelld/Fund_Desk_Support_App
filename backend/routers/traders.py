import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import Order, PositionLimit, SystemEvent, Trader
from schemas import (
    OrderOut,
    PositionLimitOut,
    SystemEventOut,
    TraderDetailOut,
    TraderListItem,
)

router = APIRouter()


def _util(trader: Trader) -> float:
    if trader.margin_limit and trader.margin_limit > 0:
        return round(trader.margin_used / trader.margin_limit * 100, 1)
    return 0.0


def _build_list_item(trader: Trader) -> TraderListItem:
    return TraderListItem(
        id=trader.id,
        display_name=trader.display_name,
        email=trader.email,
        desk=trader.desk,
        risk_state=trader.risk_state,
        session_status=trader.session_status,
        margin_utilization=_util(trader),
        realized_pnl=trader.realized_pnl,
    )


def _build_detail(trader: Trader, limits: list) -> TraderDetailOut:
    return TraderDetailOut(
        id=trader.id,
        display_name=trader.display_name,
        email=trader.email,
        desk=trader.desk,
        risk_state=trader.risk_state,
        session_status=trader.session_status,
        realized_pnl=trader.realized_pnl,
        unrealized_pnl=trader.unrealized_pnl,
        permissioned_symbols=json.loads(trader.permissioned_symbols or "[]"),
        margin_used=trader.margin_used,
        margin_limit=trader.margin_limit,
        maintenance_margin=trader.maintenance_margin,
        aggregate_position_limit=trader.aggregate_position_limit,
        margin_utilization=_util(trader),
        position_limits=[PositionLimitOut.model_validate(l) for l in limits],
        created_at=trader.created_at,
    )


@router.get("", response_model=List[TraderListItem])
def list_traders(
    search: Optional[str] = Query(None, description="Filter by name, email, ID, or desk"),
    db: Session = Depends(get_db),
):
    q = db.query(Trader)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Trader.display_name.ilike(term),
                Trader.email.ilike(term),
                Trader.id.ilike(term),
                Trader.desk.ilike(term),
            )
        )
    traders = q.order_by(Trader.risk_state, Trader.display_name).limit(100).all()
    return [_build_list_item(t) for t in traders]


@router.get("/{trader_id}", response_model=TraderDetailOut)
def get_trader(trader_id: str, db: Session = Depends(get_db)):
    trader = db.query(Trader).filter(Trader.id == trader_id).first()
    if not trader:
        raise HTTPException(status_code=404, detail="Trader not found")
    limits = (
        db.query(PositionLimit)
        .filter(PositionLimit.trader_id == trader_id)
        .all()
    )
    return _build_detail(trader, limits)


@router.get("/{trader_id}/orders", response_model=List[OrderOut])
def get_trader_orders(
    trader_id: str,
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    trader = db.query(Trader).filter(Trader.id == trader_id).first()
    if not trader:
        raise HTTPException(status_code=404, detail="Trader not found")
    q = db.query(Order).filter(Order.trader_id == trader_id)
    if status:
        q = q.filter(Order.status == status)
    return [OrderOut.model_validate(o) for o in q.order_by(Order.submitted_at.desc()).all()]


@router.get("/{trader_id}/events", response_model=List[SystemEventOut])
def get_trader_events(trader_id: str, db: Session = Depends(get_db)):
    trader = db.query(Trader).filter(Trader.id == trader_id).first()
    if not trader:
        raise HTTPException(status_code=404, detail="Trader not found")
    events = (
        db.query(SystemEvent)
        .filter(SystemEvent.trader_id == trader_id)
        .order_by(SystemEvent.timestamp.desc())
        .all()
    )
    return [SystemEventOut.model_validate(e) for e in events]
