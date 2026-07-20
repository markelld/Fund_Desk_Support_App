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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(overview.router, prefix="/api/overview", tags=["overview"])
app.include_router(traders.router, prefix="/api/traders", tags=["traders"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
