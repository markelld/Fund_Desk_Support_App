from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Order, OrderEvent, PositionLimit, SystemEvent, Trader
from schemas import DiagnosisOut, OrderEventOut, OrderWithEventsOut, SystemEventOut

router = APIRouter()


@router.get("/{order_id}", response_model=OrderWithEventsOut)
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.seq)
        .all()
    )
    return OrderWithEventsOut(
        id=order.id,
        trader_id=order.trader_id,
        symbol=order.symbol,
        side=order.side,
        order_type=order.order_type,
        qty=order.qty,
        venue=order.venue,
        limit_price=order.limit_price,
        status=order.status,
        reject_reason=order.reject_reason,
        submitted_at=order.submitted_at,
        resolved_at=order.resolved_at,
        events=[OrderEventOut.model_validate(e) for e in events],
    )


def _correlated_events(order: Order, db: Session) -> List[SystemEvent]:
    window_start = order.submitted_at - timedelta(hours=8)
    window_end = order.submitted_at + timedelta(minutes=10)
    return (
        db.query(SystemEvent)
        .filter(
            SystemEvent.trader_id == order.trader_id,
            SystemEvent.timestamp >= window_start,
            SystemEvent.timestamp <= window_end,
        )
        .order_by(SystemEvent.timestamp.desc())
        .limit(5)
        .all()
    )


def _diagnose(order: Order, events: list, correlated: list, db: Session) -> DiagnosisOut:
    corr_out = [SystemEventOut.model_validate(e) for e in correlated]

    if order.status == "rejected":
        reason = order.reject_reason or "unknown"

        if reason == "position_limit_breach":
            limits = (
                db.query(PositionLimit)
                .filter(PositionLimit.trader_id == order.trader_id)
                .all()
            )
            trader = db.query(Trader).filter(Trader.id == order.trader_id).first()
            sym_limit = next((l for l in limits if l.symbol == order.symbol), None)
            agg_current = sum(l.current_qty for l in limits)
            agg_limit = trader.aggregate_position_limit if trader else 60

            if sym_limit:
                new_qty = sym_limit.current_qty + order.qty
                agg_new = agg_current + order.qty
                summary = (
                    f"Rejected at pre_trade_risk. Trader held {sym_limit.current_qty} {order.symbol} "
                    f"contracts; a {order.qty}-lot {order.side} would take the position to {new_qty}, "
                    f"hitting the {order.symbol} limit of {sym_limit.limit_qty}."
                )
                if agg_new > agg_limit:
                    summary += (
                        f" The aggregate would reach {agg_new} against a {agg_limit}-contract cap."
                    )
            else:
                summary = f"Rejected at pre_trade_risk — position_limit_breach on {order.symbol}."

            detail = (
                "Not a platform fault — the risk system worked as designed. "
                "Check the event log for any recent limit changes. "
                "Advise the trader to reduce their position before re-submitting."
            )
            return DiagnosisOut(
                order_id=order.id, verdict="risk_system",
                summary=summary, detail=detail, correlated_events=corr_out,
            )

        if reason == "insufficient_margin":
            summary = (
                f"Rejected at margin_check. Account margin utilization was too high to accept "
                f"this {order.qty}-lot {order.side} {order.symbol} order."
            )
            detail = (
                "Not a platform fault. Trader must reduce open exposure or await intraday margin reset."
            )
            return DiagnosisOut(
                order_id=order.id, verdict="risk_system",
                summary=summary, detail=detail, correlated_events=corr_out,
            )

        if reason == "connection_lost":
            summary = (
                f"Order {order.id} rejected due to a desk connectivity failure. "
                f"The {order.qty}-lot {order.symbol} {order.side} was not sent to the exchange."
            )
            detail = (
                "Platform event. No fill was executed — safe to resubmit once the desk reconnects. "
                "Check session events for the disconnect timestamp."
            )
            return DiagnosisOut(
                order_id=order.id, verdict="platform_fault",
                summary=summary, detail=detail, correlated_events=corr_out,
            )

        if reason == "outside_trading_hours":
            summary = (
                f"Rejected — order submitted outside permitted trading hours for {order.symbol}."
            )
            detail = "Verify the active trading session window for this instrument and venue."
            return DiagnosisOut(
                order_id=order.id, verdict="trader_action",
                summary=summary, detail=detail, correlated_events=corr_out,
            )

        if reason == "risk_limit":
            summary = (
                f"Rejected at risk_check — account-level risk limit breach on {order.symbol}."
            )
            detail = "Escalate to the risk desk for a limit review before the trader resubmits."
            return DiagnosisOut(
                order_id=order.id, verdict="risk_system",
                summary=summary, detail=detail, correlated_events=corr_out,
            )

        summary = f"Order rejected — reason: {reason}."
        detail = "Review the full event log for additional context."
        return DiagnosisOut(
            order_id=order.id, verdict="risk_system",
            summary=summary, detail=detail, correlated_events=corr_out,
        )

    if order.status == "cancelled":
        if order.reject_reason == "connection_lost":
            summary = (
                f"Order cancelled due to desk connection failure. "
                f"The {order.qty}-lot {order.symbol} {order.side} was routed but the exchange ack "
                "was not received before connectivity dropped."
            )
            detail = (
                "Platform connectivity event. No fill was executed — safe to resubmit. "
                "Check session events for the exact disconnect timestamp and duration."
            )
            return DiagnosisOut(
                order_id=order.id, verdict="platform_fault",
                summary=summary, detail=detail, correlated_events=corr_out,
            )
        summary = f"Order {order.id} was cancelled. No fill was executed."
        detail = "Resubmit if still required."
        return DiagnosisOut(
            order_id=order.id, verdict="normal",
            summary=summary, detail=detail, correlated_events=corr_out,
        )

    if order.status in ("filled", "partially_filled"):
        slow = [e for e in events if e.latency_ms > 500]
        if slow:
            worst = max(slow, key=lambda e: e.latency_ms)
            summary = (
                f"Order filled successfully. Routing latency spike detected: "
                f"{worst.event_type} took {worst.latency_ms}ms (threshold: 500ms)."
            )
            detail = (
                "No trader action required — the fill completed. "
                "Flag the latency spike to the venue team if this is a recurring pattern on this route."
            )
            return DiagnosisOut(
                order_id=order.id, verdict="slow_fill",
                summary=summary, detail=detail, correlated_events=corr_out,
            )
        summary = "Order filled normally. All lifecycle stages completed within expected latency."
        detail = "No issues detected. Risk checks, margin check, routing, and fill all nominal."
        return DiagnosisOut(
            order_id=order.id, verdict="normal",
            summary=summary, detail=detail, correlated_events=corr_out,
        )

    summary = f"Order status: {order.status}."
    detail = "No further analysis available for this order state."
    return DiagnosisOut(
        order_id=order.id, verdict="normal",
        summary=summary, detail=detail, correlated_events=corr_out,
    )


@router.get("/{order_id}/diagnosis", response_model=DiagnosisOut)
def get_order_diagnosis(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.seq)
        .all()
    )
    correlated = _correlated_events(order, db)
    return _diagnose(order, events, correlated, db)
