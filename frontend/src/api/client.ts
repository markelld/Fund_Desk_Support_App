import type {
  Diagnosis,
  Order,
  OrderWithEvents,
  Overview,
  SystemEvent,
  TraderDetail,
  TraderListItem,
} from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  searchTraders: (q: string) =>
    get<TraderListItem[]>(`/api/traders?search=${encodeURIComponent(q)}`),

  listTraders: () => get<TraderListItem[]>("/api/traders"),

  getTrader: (id: string) => get<TraderDetail>(`/api/traders/${id}`),

  getTraderOrders: (id: string, status?: string) =>
    get<Order[]>(`/api/traders/${id}/orders${status ? `?status=${status}` : ""}`),

  getTraderEvents: (id: string) =>
    get<SystemEvent[]>(`/api/traders/${id}/events`),

  getOrder: (id: string) => get<OrderWithEvents>(`/api/orders/${id}`),

  getDiagnosis: (id: string) => get<Diagnosis>(`/api/orders/${id}/diagnosis`),

  getOverview: () => get<Overview>("/api/overview"),
};
