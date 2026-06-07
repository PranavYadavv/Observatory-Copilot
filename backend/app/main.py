"""
Observability Co-Pilot — Consolidated API Service
FastAPI app with all REST endpoints + WebSocket per TRD v2 §4.

Run: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import json
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import init_db, get_db, close_db
from .models import (
    AlertConfigRequest, RatingRequest, SeverityLevel, AnomalyType,
)
from .simulator import run_simulator, stop_simulator, register_ws_clients, get_stats
from .welford import get_all_baselines

# ── Globals ─────────────────────────────────────────
_start_time = time.time()
_ws_clients: list[WebSocket] = []


# ── Lifespan ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    register_ws_clients(_ws_clients)
    sim_task = asyncio.create_task(run_simulator())
    print("\n" + "=" * 60)
    print("  Observability Co-Pilot -- API running on :8000")
    print("  Dashboard API: http://localhost:8000/api/v1")
    print("  Health:        http://localhost:8000/api/v1/health")
    print("  WebSocket:     ws://localhost:8000/ws/incidents")
    print("  Demo API Key:  demo-key-2026")
    print("=" * 60 + "\n")
    yield
    stop_simulator()
    sim_task.cancel()
    await close_db()


app = FastAPI(
    title="Observability Co-Pilot API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow dashboard on port 3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def is_valid_api_key(x_api_key: str) -> bool:
    db = await get_db()
    rows = await db.execute_fetchall(
        "SELECT key_hash FROM api_keys WHERE revoked_at IS NULL"
    )
    for row in rows:
        if bcrypt.checkpw(x_api_key.encode(), row["key_hash"].encode()):
            return True
    return False


async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify X-API-Key header and reject missing or invalid keys."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    if not await is_valid_api_key(x_api_key):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True


@app.middleware("http")
async def enforce_api_key(request: Request, call_next):
    if request.url.path.startswith("/api/v1"):
        x_api_key = request.headers.get("x-api-key")
        if not x_api_key or not await is_valid_api_key(x_api_key):
            return error("unauthorized", "Missing or invalid X-API-Key", status_code=401)
    return await call_next(request)


# ── Response helpers ────────────────────────────────
def ok(data, meta=None):
    return {"status": "ok", "data": data, "meta": meta}

def error(code: str, message: str, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={"status": "error", "code": code, "message": message}
    )


def _parse_incident(row) -> dict:
    """Parse a DB incident row into API format."""
    d = dict(row)
    # Parse JSON fields
    for field in ["contributing_factors", "remediation_steps"]:
        if isinstance(d.get(field), str):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                d[field] = []
    # Convert boolean ints
    d["llm_fallback_used"] = bool(d.get("llm_fallback_used", 0))
    d["auto_resolved"] = bool(d.get("auto_resolved", 0))
    return d


# ════════════════════════════════════════════════════
# REST API ENDPOINTS (TRD §4.1)
# ════════════════════════════════════════════════════

# ── Incidents ───────────────────────────────────────
@app.get("/api/v1/incidents")
async def list_incidents(
    service: Optional[str] = None,
    severity: Optional[str] = None,
    from_time: Optional[str] = Query(None, alias="from"),
    to_time: Optional[str] = Query(None, alias="to"),
    page: int = 1,
    page_size: int = 20,
):
    db = await get_db()
    conditions = []
    params = []

    if service:
        conditions.append("service_name = ?")
        params.append(service)
    if severity:
        conditions.append("severity = ?")
        params.append(severity)
    if from_time:
        conditions.append("detected_at >= ?")
        params.append(from_time)
    if to_time:
        conditions.append("detected_at <= ?")
        params.append(to_time)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    offset = (page - 1) * page_size

    count_row = await db.execute_fetchone(
        f"SELECT COUNT(*) as total FROM incidents {where}", params
    )
    total = count_row["total"] if count_row else 0

    rows = await db.execute_fetchall(
        f"SELECT * FROM incidents {where} ORDER BY detected_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )

    incidents = [_parse_incident(r) for r in rows]
    return ok(incidents, {"page": page, "page_size": page_size, "total": total})


@app.get("/api/v1/incidents/{incident_id}")
async def get_incident(incident_id: str):
    db = await get_db()
    row = await db.execute_fetchone(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    )
    if not row:
        return error("INCIDENT_NOT_FOUND", f"Incident {incident_id} not found", 404)
    return ok(_parse_incident(row))


@app.patch("/api/v1/incidents/{incident_id}/rating")
async def rate_incident(incident_id: str, body: RatingRequest):
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE incidents SET user_rating = ?, user_rating_at = ?, updated_at = ? WHERE id = ?",
        (body.rating, now, now, incident_id)
    )
    await db.commit()
    return ok({"id": incident_id, "user_rating": body.rating})


@app.patch("/api/v1/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE incidents SET resolved_at = ?, updated_at = ? WHERE id = ?",
        (now, now, incident_id)
    )
    await db.commit()
    return ok({"id": incident_id, "resolved_at": now})


# ── Anomalies ──────────────────────────────────────
@app.get("/api/v1/anomalies")
async def list_anomalies(
    service: Optional[str] = None,
    severity: Optional[str] = None,
    suppressed: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
):
    db = await get_db()
    conditions = []
    params = []

    if service:
        conditions.append("service_name = ?")
        params.append(service)
    if severity:
        conditions.append("severity = ?")
        params.append(severity)
    if suppressed is not None:
        conditions.append("suppressed_by_cooldown = ?")
        params.append(1 if suppressed else 0)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    offset = (page - 1) * page_size

    count_row = await db.execute_fetchone(
        f"SELECT COUNT(*) as total FROM anomaly_events {where}", params
    )
    total = count_row["total"] if count_row else 0

    rows = await db.execute_fetchall(
        f"SELECT * FROM anomaly_events {where} ORDER BY detected_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )
    return ok([dict(r) for r in rows], {"page": page, "page_size": page_size, "total": total})


# ── Metrics ────────────────────────────────────────
@app.get("/api/v1/metrics/{service}")
async def get_metrics(
    service: str,
    metric: Optional[str] = None,
    from_time: Optional[str] = Query(None, alias="from"),
    to_time: Optional[str] = Query(None, alias="to"),
    granularity: str = "1m",
):
    db = await get_db()
    now = datetime.now(timezone.utc)
    
    if not from_time:
        from_time = (now - timedelta(hours=1)).isoformat()
    if not to_time:
        to_time = now.isoformat()

    conditions = ["service_name = ?", "timestamp >= ?", "timestamp <= ?"]
    params = [service, from_time, to_time]

    if metric:
        conditions.append("metric_name = ?")
        params.append(metric)

    where = f"WHERE {' AND '.join(conditions)}"

    rows = await db.execute_fetchall(
        f"SELECT metric_name, timestamp, value, unit FROM metrics {where} ORDER BY timestamp",
        params
    )
    
    # Group by metric_name
    grouped: dict[str, list] = {}
    for r in rows:
        d = dict(r)
        name = d["metric_name"]
        if name not in grouped:
            grouped[name] = []
        grouped[name].append({
            "timestamp": d["timestamp"],
            "value": round(d["value"], 2),
        })

    return ok(grouped)


# ── Services ───────────────────────────────────────
@app.get("/api/v1/services")
async def list_services():
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    rows = await db.execute_fetchall(
        """SELECT service_name, MAX(timestamp) as last_seen, COUNT(*) as metric_count
           FROM metrics WHERE timestamp >= ? GROUP BY service_name""",
        (cutoff,)
    )

    services = []
    for r in rows:
        d = dict(r)
        # Count incidents
        inc_row = await db.execute_fetchone(
            "SELECT COUNT(*) as cnt FROM incidents WHERE service_name = ? AND detected_at >= ?",
            (d["service_name"], cutoff)
        )
        # Count anomalies
        anom_row = await db.execute_fetchone(
            "SELECT COUNT(*) as cnt FROM anomaly_events WHERE service_name = ? AND detected_at >= ?",
            (d["service_name"], cutoff)
        )
        
        inc_count = inc_row["cnt"] if inc_row else 0
        anom_count = anom_row["cnt"] if anom_row else 0
        status = "critical" if inc_count > 0 else ("warning" if anom_count > 0 else "healthy")

        services.append({
            "service_name": d["service_name"],
            "status": status,
            "last_seen": d["last_seen"],
            "metric_count_24h": d["metric_count"],
            "incident_count_24h": inc_count,
            "anomaly_count_24h": anom_count,
        })

    return ok(services)


# ── Alert Config ───────────────────────────────────
@app.get("/api/v1/alerts/config")
async def list_alert_configs():
    db = await get_db()
    rows = await db.execute_fetchall("SELECT * FROM alert_configs ORDER BY service_name")
    configs = []
    for r in rows:
        d = dict(r)
        d["enabled"] = bool(d.get("enabled", 1))
        configs.append(d)
    return ok(configs)


@app.post("/api/v1/alerts/config")
async def upsert_alert_config(body: AlertConfigRequest):
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    config_id = str(uuid.uuid4())

    await db.execute(
        """INSERT INTO alert_configs
           (id, service_name, zscore_threshold_critical, zscore_threshold_warning,
            iqr_multiplier, baseline_window_minutes, min_anomaly_duration_secs,
            direction_sensitivity, cooldown_minutes, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(service_name) DO UPDATE SET
            zscore_threshold_critical = excluded.zscore_threshold_critical,
            zscore_threshold_warning = excluded.zscore_threshold_warning,
            iqr_multiplier = excluded.iqr_multiplier,
            baseline_window_minutes = excluded.baseline_window_minutes,
            min_anomaly_duration_secs = excluded.min_anomaly_duration_secs,
            direction_sensitivity = excluded.direction_sensitivity,
            cooldown_minutes = excluded.cooldown_minutes,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at""",
        (
            config_id, body.service_name,
            body.zscore_threshold_critical, body.zscore_threshold_warning,
            body.iqr_multiplier, body.baseline_window_minutes,
            body.min_anomaly_duration_secs, body.direction_sensitivity,
            body.cooldown_minutes, 1 if body.enabled else 0,
            now, now,
        )
    )
    await db.commit()
    return ok({"service_name": body.service_name, "updated_at": now})


# ── DLQ ────────────────────────────────────────────
@app.get("/api/v1/dlq")
async def list_dlq(source_topic: Optional[str] = None, page: int = 1, page_size: int = 20):
    db = await get_db()
    conditions = ["reviewed = 0"]
    params = []
    if source_topic:
        conditions.append("source_topic = ?")
        params.append(source_topic)
    where = f"WHERE {' AND '.join(conditions)}"
    offset = (page - 1) * page_size

    rows = await db.execute_fetchall(
        f"SELECT * FROM dlq_events {where} ORDER BY received_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )
    return ok([dict(r) for r in rows])


@app.patch("/api/v1/dlq/{event_id}/review")
async def review_dlq(event_id: str):
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE dlq_events SET reviewed = 1, reviewed_at = ?, reviewed_by = 'dashboard' WHERE id = ?",
        (now, event_id)
    )
    await db.commit()
    return ok({"id": event_id, "reviewed": True})


# ── Health ─────────────────────────────────────────
@app.get("/api/v1/health")
async def health_check():
    uptime = time.time() - _start_time
    sim = get_stats()
    
    return {
        "status": "healthy",
        "version": "2.0.0",
        "uptime_seconds": round(uptime, 1),
        "checks": {
            "database": {"status": "healthy", "type": "SQLite"},
            "simulator": {
                "status": "running" if sim["running"] else "stopped",
                "services": sim["services"],
                "anomalies_detected": sim["anomaly_count"],
                "incidents_created": sim["incident_count"],
            },
            "websocket": {
                "status": "healthy",
                "connected_clients": len(_ws_clients),
            },
        },
    }


# ── Stats (extra endpoint for dashboard) ──────────
@app.get("/api/v1/stats")
async def get_stats_endpoint():
    db = await get_db()
    now = datetime.now(timezone.utc)
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    cutoff_1h = (now - timedelta(hours=1)).isoformat()

    total_incidents = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM incidents"
    )
    active_incidents = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM incidents WHERE resolved_at IS NULL"
    )
    incidents_1h = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM incidents WHERE created_at >= ?", (cutoff_1h,)
    )
    total_anomalies = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM anomaly_events"
    )
    critical_anomalies = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM anomaly_events WHERE severity = 'CRITICAL'"
    )
    services = await db.execute_fetchone(
        "SELECT COUNT(DISTINCT service_name) as cnt FROM metrics WHERE timestamp >= ?",
        (cutoff_24h,)
    )
    avg_confidence = await db.execute_fetchone(
        "SELECT AVG(confidence_score) as avg FROM incidents WHERE confidence_score IS NOT NULL"
    )

    return ok({
        "total_incidents": total_incidents["cnt"] if total_incidents else 0,
        "active_incidents": active_incidents["cnt"] if active_incidents else 0,
        "incidents_last_hour": incidents_1h["cnt"] if incidents_1h else 0,
        "total_anomalies": total_anomalies["cnt"] if total_anomalies else 0,
        "critical_anomalies": critical_anomalies["cnt"] if critical_anomalies else 0,
        "monitored_services": services["cnt"] if services else 0,
        "avg_confidence_score": round(avg_confidence["avg"], 2) if avg_confidence and avg_confidence["avg"] else 0,
        "baselines": get_all_baselines(),
    })


# ── Baselines (debug endpoint) ────────────────────
@app.get("/api/v1/baselines")
async def get_baselines():
    return ok(get_all_baselines())


# ════════════════════════════════════════════════════
# WEBSOCKET (TRD §4.3)
# ════════════════════════════════════════════════════

@app.websocket("/ws/incidents")
async def websocket_endpoint(websocket: WebSocket):
    x_api_key = websocket.headers.get("x-api-key") or websocket.query_params.get("api_key")
    if not x_api_key or not await is_valid_api_key(x_api_key):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    _ws_clients.append(websocket)
    
    try:
        # Send connected message
        await websocket.send_json({
            "type": "connected",
            "client_id": str(uuid.uuid4()),
            "message": "Connected to incident stream"
        })
        
        # Keep alive — ping every 30s
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
            except WebSocketDisconnect:
                break
    finally:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)
