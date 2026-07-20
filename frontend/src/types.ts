export interface PositionLimit {
  symbol: string;
  current_qty: number;
  limit_qty: number;
}

export interface TraderListItem {
  id: string;
  display_name: string;
  email: string;
  desk: string;
  risk_state: string;
  session_status: string;
  margin_utilization: number;
  realized_pnl: number;
}

export interface TraderDetail extends TraderListItem {
  unrealized_pnl: number;
  permissioned_symbols: string[];
  margin_used: number;
  margin_limit: number;
  maintenance_margin: number;
  aggregate_position_limit: number;
  position_limits: PositionLimit[];
  created_at: string;
}

export interface Order {
  id: string;
  trader_id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  venue: string;
  limit_price: number | null;
  status: string;
  reject_reason: string | null;
  submitted_at: string;
  resolved_at: string | null;
}

export interface OrderEvent {
  id: number;
  order_id: string;
  seq: number;
  event_type: string;
  latency_ms: number;
  detail: string;
  timestamp: string;
}

export interface OrderWithEvents extends Order {
  events: OrderEvent[];
}

export interface SystemEvent {
  id: number;
  trader_id: string;
  severity: string;
  category: string;
  message: string;
  timestamp: string;
}

export interface Diagnosis {
  order_id: string;
  verdict: string;
  summary: string;
  detail: string;
  correlated_events: SystemEvent[];
}

export interface FirmStats {
  total_traders: number;
  live_count: number;
  restricted_count: number;
  flagged_count: number;
  halted_count: number;
  firm_margin_utilization: number;
  total_realized_pnl: number;
}

export interface DeskSummary {
  desk_group: string;
  trader_count: number;
  live_count: number;
  avg_margin_utilization: number;
  restricted_count: number;
  flagged_count: number;
  halted_count: number;
  total_realized_pnl: number;
}

export interface AlertItem {
  id: number;
  trader_id: string;
  trader_name: string;
  desk: string;
  severity: string;
  category: string;
  message: string;
  timestamp: string;
}

export interface Overview {
  firm: FirmStats;
  desks: DeskSummary[];
  recent_alerts: AlertItem[];
}
