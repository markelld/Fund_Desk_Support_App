from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import health, traders, orders, overview

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Desk Support Console",
    description="Internal support tool for trading desk operations.",
    version="1.0.0",
)

import os

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://frontend:5173",
]
# Allow any Vercel deployment URL set via env var
if os.getenv("FRONTEND_URL"):
    CORS_ORIGINS.append(os.environ["FRONTEND_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(overview.router, prefix="/api/overview", tags=["overview"])
app.include_router(traders.router, prefix="/api/traders", tags=["traders"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
