"""
FastAPI backend server — exposes the LangGraph agents as HTTP endpoints.
Runs alongside Next.js: Next.js on :3000, this on :8000.

Start: uvicorn src.backend.api.server:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routes.triage import router as triage_router
from .routes.claims import router as claims_router
from .routes.health import router as health_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Arlo backend starting up")
    yield
    logger.info("Arlo backend shutting down")


app = FastAPI(
    title="Arlo Health AI Backend",
    description="LangGraph-powered clinical intelligence APIs",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(triage_router, prefix="/api/backend", tags=["triage"])
app.include_router(claims_router, prefix="/api/backend", tags=["claims"])
app.include_router(health_router, prefix="/api/backend", tags=["health"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)[:200]},
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "arlo-backend"}
