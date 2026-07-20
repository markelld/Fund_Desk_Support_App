# Desk Support Console

> Built by a futures trader who got tired of cross-referencing three systems to answer one support ticket.

A full-stack internal ops tool for a futures trading desk. When a trader calls in blocked — order rejected, fill taking too long, platform disconnected — this console surfaces the full picture in one view: firm-wide risk state, margin utilization, position limits, the complete order lifecycle with per-hop latency, and a plain-language diagnosis that tells support exactly what happened and why.

**Mock data only. No live broker connections, no real auth, no external APIs.**

---

## Why this exists

Prop desk support is almost always reactive. A trader calls in angry, support opens three separate systems — the risk dashboard, the order blotter, the event log — cross-references timestamps, and tries to piece together a story. By the time they have an answer, the trader has already missed the move.

This tool collapses that workflow into a single view. The firm overview gives management a live read on every desk. The trader detail page shows margin state, position limits, and the event log together. The order lifecycle view shows every step from received → risk check → routing → fill (or reject), with per-hop latency flagged if it exceeded 500ms, and a generated diagnosis at the top that says what went wrong in plain English.

The domain knowledge is real — margin utilization, position limits, reject reasons, routing latency. This is the tool I'd want on a desk I was actually running.

---

## Screens

### Fund Overview `/`
Management homepage. Firm-wide stat cards (total traders, live sessions, risk alerts, margin utilization, total P&L), desk-by-desk breakdown table with risk flags and average margin, and a live feed of recent warning/error events across all desks. Clicking a desk row pre-filters the trader lookup to that group.

### Trader Lookup `/traders`
Search by name, email, ID, or desk. Results table with color-coded risk state, margin utilization (amber at 70%, red at 90%), realized P&L, and session status. Restricted/halted rows are highlighted red. Clicking a desk row on the overview lands here pre-filtered.

### Trader Detail `/traders/:id`
Summary card with risk state, session status, realized/unrealized P&L, and permissioned symbols. Margin & buying power panel with utilization gauge (the signature element — gradient turns red as utilization approaches the limit). Position limits table per symbol + aggregate. Risk & system event log with category filters. Full order history table filterable by status, with rejected orders highlighted.

### Order Lifecycle `/orders/:id`
The star feature. A vertical timeline of every step the order took — `received → pre_trade_risk → margin_check → routed_to_venue → exchange_ack → fill` (or `reject`/`cancel`). Each step shows timestamp, latency from the prior step, and detail text. Steps that weren't reached are shown faded. Any hop over 500ms is flagged in amber. A diagnosis box at the top gives a plain-language root-cause summary. Correlated system events (the risk limit change from 5 hours earlier, the connection drop that caused the cancel) are surfaced in a panel beside the timeline.

---

## Architecture

```
┌──────────────────────────────────┐         HTTP / JSON        ┌─────────────────────────────┐
│        React + TypeScript         │ ◄─────────────────────── ► │     FastAPI + SQLAlchemy    │
│        Vite · Tailwind CSS        │          /api/*             │     SQLite · Pydantic v2    │
│        React Router v6            │                             │     Auto Swagger docs       │
└──────────────────────────────────┘                             └─────────────────────────────┘
        /                  Fund Overview (management homepage)
        /traders           Trader Lookup + search
        /traders/:id       Trader Detail — margin, positions, events, orders
        /orders/:id        Order Lifecycle — timeline, diagnosis, correlated events
```

---

## Data model

```
traders          id · display_name · desk · risk_state · session_status
                 margin_used · margin_limit · maintenance_margin
                 realized_pnl · unrealized_pnl · permissioned_symbols

position_limits  trader_id · symbol · current_qty · limit_qty

orders           id · trader_id · symbol · side · order_type · qty · venue
                 status · reject_reason · submitted_at · resolved_at

order_events     order_id · seq · event_type · latency_ms · detail · timestamp

system_events    trader_id · severity · category · message · timestamp
```

---

## API

```
GET  /health
GET  /api/overview                        firm stats + desk breakdown + recent alerts
GET  /api/traders?search=<q>             search by name, email, ID, or desk
GET  /api/traders/{id}                   full detail + margin + position limits
GET  /api/traders/{id}/orders            order list (optional ?status= filter)
GET  /api/traders/{id}/events            system event log, reverse chronological
GET  /api/orders/{id}                    order + full lifecycle event chain
GET  /api/orders/{id}/diagnosis          generated plain-language root-cause summary
```

Interactive docs available at `/docs` (Swagger UI).

---

## Hero trader scenarios

Four deterministic traders seeded first — easy to find and demo.

**Miguel Reyes — position limit breach**
Holds 30 MNQ contracts against a 40-contract limit. A 10-lot market order would hit the MNQ cap and push the aggregate to 67 against a 60-contract firm limit. The risk desk had lowered the MNQ limit from 60 to 40 five hours earlier — the diagnosis surfaces that event and tells support exactly what to relay to the trader.

**Diane Howell — routing latency spike**
Order filled successfully, but the `routed_to_venue` hop took 780ms against a 500ms threshold. The lifecycle timeline flags it in amber, the diagnosis identifies the slow leg and points the venue team at the right place to investigate.

**Ray Ortega — mid-session disconnect**
Desk terminal ENRG-1 dropped connection after the order was routed but before exchange ack. The cancel event and the `connection_lost` system event are timestamped 3 seconds apart. The correlated events panel surfaces both so support can confirm no fill was executed and the trader can safely resubmit.

**Priya Nair — healthy account**
Clean fills, positive P&L, 19% margin utilization, all position limits well inside caps. Every lifecycle stage green. A good baseline for comparison when demoing the other three.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy · SQLite |
| Validation | Pydantic v2 |
| Frontend | React 18 · TypeScript · Vite |
| Styling | Tailwind CSS v3 · IBM Plex Mono · Inter |
| Routing | React Router v6 |
| Seed data | Faker (fixed seed — deterministic, coherent) |

---

## Run locally

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 seed.py           # creates desk_support.db — 50 traders, ~600 orders
uvicorn main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger)

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Run with Docker

```bash
docker compose up --build
# Backend  → http://localhost:8000
# Frontend → http://localhost:5173
```

---

## What I'd build next

- **Real-time event stream** — WebSocket or SSE push so the fund overview and alert feed update live without polling
- **Configurable alert thresholds** — rules engine where risk managers set margin % and position limit triggers that surface banners before traders call in
- **Auth + roles** — read-only analyst view vs. write-capable risk desk view, with a full audit log of who accessed what and when
- **Cross-desk analytics** — surface when multiple traders on the same desk are simultaneously approaching limits, giving risk an early-warning view before it becomes a firm-level problem
- **Order amendment + cancel actions** — let support engineers cancel open orders directly from the lifecycle view rather than routing through a separate OMS
