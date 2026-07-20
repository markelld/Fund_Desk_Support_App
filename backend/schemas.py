from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class PositionLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    current_qty: int
    limit_qty: int


class TraderListItem(BaseModel):
    id: str
    display_name: str
    email: str
    desk: str
    risk_state: str
    session_status: str
    margin_utilization: float
    realized_pnl: float


class TraderDetailOut(BaseModel):
    id: str
    display_name: str
    email: str
    desk: str
    risk_state: str
    session_status: str
    realized_pnl: float
    unrealized_pnl: float
    permissioned_symbols: List[str]
    margin_used: float
    margin_limit: float
    maintenance_margin: float
    aggregate_position_limit: int
    margin_utilization: float
    position_limits: List[PositionLimitOut]
    created_at: datetime


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trader_id: str
    symbol: str
    side: str
    order_type: str
    qty: int
    venue: str
    limit_price: Optional[float]
    status: str
    reject_reason: Optional[str]
    submitted_at: datetime
    resolved_at: Optional[datetime]


class OrderEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: str
    seq: int
    event_type: str
    latency_ms: int
    detail: str
    timestamp: datetime


class OrderWithEventsOut(BaseModel):
    id: str
    trader_id: str
    symbol: str
    side: str
    order_type: str
    qty: int
    venue: str
    limit_price: Optional[float]
    status: str
    reject_reason: Optional[str]
    submitted_at: datetime
    resolved_at: Optional[datetime]
    events: List[OrderEventOut]


class SystemEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trader_id: str
    severity: str
    category: str
    message: str
    timestamp: datetime


class DiagnosisOut(BaseModel):
    order_id: str
    verdict: str  # risk_system | platform_fault | slow_fill | normal
    summary: str
    detail: str
    correlated_events: List[SystemEventOut]


# ---------------------------------------------------------------------------
# Overview (management homepage)
# ---------------------------------------------------------------------------

class FirmStats(BaseModel):
    total_traders: int
    live_count: int
    restricted_count: int
    flagged_count: int
    halted_count: int
    firm_margin_utilization: float
    total_realized_pnl: float


class DeskSummary(BaseModel):
    desk_group: str
    trader_count: int
    live_count: int
    avg_margin_utilization: float
    restricted_count: int
    flagged_count: int
    halted_count: int
    total_realized_pnl: float


class AlertItem(BaseModel):
    id: int
    trader_id: str
    trader_name: str
    desk: str
    severity: str
    category: str
    message: str
    timestamp: datetime


class OverviewOut(BaseModel):
    firm: FirmStats
    desks: List[DeskSummary]
    recent_alerts: List[AlertItem]
