from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class Trader(Base):
    __tablename__ = "traders"

    id = Column(String, primary_key=True)
    display_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    desk = Column(String, nullable=False)
    risk_state = Column(String, nullable=False)   # active|restricted|flagged|halted
    session_status = Column(String, nullable=False)  # live|offline
    realized_pnl = Column(Float, default=0.0)
    unrealized_pnl = Column(Float, default=0.0)
    permissioned_symbols = Column(Text, nullable=False)  # JSON array string
    margin_used = Column(Float, default=0.0)
    margin_limit = Column(Float, default=500_000.0)
    maintenance_margin = Column(Float, default=0.0)
    aggregate_position_limit = Column(Integer, default=60)
    created_at = Column(DateTime, nullable=False)

    position_limits = relationship("PositionLimit", back_populates="trader",
                                   cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="trader",
                          cascade="all, delete-orphan")
    system_events = relationship("SystemEvent", back_populates="trader",
                                 cascade="all, delete-orphan")


class PositionLimit(Base):
    __tablename__ = "position_limits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trader_id = Column(String, ForeignKey("traders.id"), nullable=False)
    symbol = Column(String, nullable=False)
    current_qty = Column(Integer, default=0)
    limit_qty = Column(Integer, nullable=False)

    trader = relationship("Trader", back_populates="position_limits")


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)
    trader_id = Column(String, ForeignKey("traders.id"), nullable=False)
    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)       # buy|sell
    order_type = Column(String, nullable=False) # market|limit|stop|stop_limit
    qty = Column(Integer, nullable=False)
    venue = Column(String, nullable=False)
    limit_price = Column(Float, nullable=True)
    status = Column(String, nullable=False)     # submitted|routed|filled|partially_filled|rejected|cancelled
    reject_reason = Column(String, nullable=True)
    submitted_at = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    trader = relationship("Trader", back_populates="orders")
    events = relationship("OrderEvent", back_populates="order",
                          order_by="OrderEvent.seq", cascade="all, delete-orphan")


class OrderEvent(Base):
    __tablename__ = "order_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    seq = Column(Integer, nullable=False)
    event_type = Column(String, nullable=False)
    latency_ms = Column(Integer, default=0)
    detail = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False)

    order = relationship("Order", back_populates="events")


class SystemEvent(Base):
    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trader_id = Column(String, ForeignKey("traders.id"), nullable=False)
    severity = Column(String, nullable=False)  # info|warning|error
    category = Column(String, nullable=False)  # risk|venue|session|auth
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False)

    trader = relationship("Trader", back_populates="system_events")
