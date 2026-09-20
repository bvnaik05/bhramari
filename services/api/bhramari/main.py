import importlib
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text

from . import auth, dashboard, logistics, passport, quality, sync, traceability, trust
from .config import settings
from .db import Base, SessionLocal, engine
from .seed import seed_demo
from .seed_identity import seed_identities


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    if settings().demo:
        with SessionLocal.begin() as db:
            seed_demo(db)
            try:
                from .seed_extra import seed_extra
                seed_extra(db)
            except ModuleNotFoundError as exc:
                if exc.name != "bhramari.seed_extra":
                    raise
    elif settings().bootstrap_file:
        with SessionLocal.begin() as db:
            seed_identities(db, settings().bootstrap_file)
    yield


app = FastAPI(title="Bhramari API", version="1.0.0", description="SIH26021 honey traceability and hive economy. Digital provenance is not chemical purity certification.", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings().cors_origins.split(","), allow_credentials=False, allow_methods=["GET", "POST", "DELETE", "PATCH"], allow_headers=["Authorization", "Content-Type"])

for module in [auth, dashboard, traceability, logistics, quality, sync, passport, trust]:
    app.include_router(module.router, prefix="/api/v1")
for name in ["community", "engagement", "intelligence", "languages", "madhu", "assisted", "control"]:
    try:
        module = importlib.import_module(f".{name}", __package__)
        app.include_router(module.router, prefix="/api/v1")
    except ModuleNotFoundError as exc:
        if exc.name != f"bhramari.{name}":
            raise

# ponytail: in-process rate buckets protect the single-worker demo; use gateway/Redis limits for multiple workers.
buckets = defaultdict(deque)
requests_total = Counter("bhramari_http_requests_total", "HTTP requests", ["method", "path", "status"])
request_seconds = Histogram("bhramari_http_request_seconds", "HTTP request duration", ["method", "path"])


@app.middleware("http")
async def protect(request: Request, call_next):
    started = time.monotonic()
    if int(request.headers.get("content-length", "0")) > 3_000_000:
        return JSONResponse({"detail": "Request exceeds 3 MB"}, status_code=413)
    key = (request.client.host if request.client else "unknown", "auth" if request.url.path.endswith("/auth/demo") else "api")
    bucket, timestamp = buckets[key], time.monotonic()
    while bucket and bucket[0] < timestamp - 60:
        bucket.popleft()
    limit = 30 if key[1] == "auth" else 600
    if len(bucket) >= limit:
        return JSONResponse({"detail": "Rate limit reached; retry in one minute"}, status_code=429, headers={"Retry-After": "60"})
    bucket.append(timestamp)
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", "unmatched")
    requests_total.labels(request.method, path, response.status_code).inc()
    request_seconds.labels(request.method, path).observe(time.monotonic() - started)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    if request.headers.get("authorization"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/v1/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "bhramari-api", "mode": "simulated-validation" if settings().demo else "production", "version": "1.0.0"}


@app.get("/metrics", include_in_schema=False)
def metrics():
    from fastapi import Response
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
