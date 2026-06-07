"""
Telemetry Simulator — generates realistic fake data for 5 microservices.
Periodically injects anomalies to trigger the detection pipeline.
"""

import asyncio
import json
import math
import random
import uuid
from datetime import datetime, timezone, timedelta

from .database import get_db
from .detection import detect_anomaly
from .correlation import generate_rca
from .models import MetricEvent, SeverityLevel

# ── Service definitions ─────────────────────────────
SERVICES = [
    {"name": "api-gateway", "metrics": ["http_request_duration_ms", "throughput_rps", "http_error_rate_percent"]},
    {"name": "user-service", "metrics": ["http_request_duration_ms", "cpu_usage_percent", "memory_usage_bytes"]},
    {"name": "order-service", "metrics": ["http_request_duration_ms", "throughput_rps", "cpu_usage_percent"]},
    {"name": "payment-service", "metrics": ["http_request_duration_ms", "http_error_rate_percent", "timeout_count"]},
    {"name": "inventory-service", "metrics": ["cpu_usage_percent", "memory_usage_bytes", "throughput_rps"]},
]

# Baseline values for each metric
METRIC_BASELINES = {
    "http_request_duration_ms": {"mean": 45.0, "std": 8.0, "unit": "ms"},
    "cpu_usage_percent": {"mean": 35.0, "std": 5.0, "unit": "%"},
    "memory_usage_bytes": {"mean": 512_000_000, "std": 50_000_000, "unit": "bytes"},
    "throughput_rps": {"mean": 1200.0, "std": 150.0, "unit": "rps"},
    "http_error_rate_percent": {"mean": 0.5, "std": 0.3, "unit": "%"},
    "timeout_count": {"mean": 2.0, "std": 1.0, "unit": "count"},
    "failed_job_count": {"mean": 1.0, "std": 0.5, "unit": "count"},
}

LOG_MESSAGES = {
    "INFO": [
        "Request processed successfully in {duration}ms",
        "Health check passed — all dependencies healthy",
        "Cache hit for user session {session_id}",
        "Connection pool stats: active=12, idle=8, total=20",
        "Kafka message produced to {topic}: offset={offset}",
        "Database query completed in {duration}ms — {rows} rows returned",
        "Auth token validated for user {user_id}",
        "Metrics batch flushed: {count} data points",
    ],
    "WARN": [
        "Request latency exceeded threshold: {duration}ms > 200ms",
        "Connection pool nearing capacity: {pool_usage}% used",
        "Retry attempt {attempt}/3 for downstream call to {service}",
        "GC pause detected: {duration}ms — consider tuning heap size",
        "Rate limit approaching: {rate}/{limit} requests in window",
    ],
    "ERROR": [
        "Request failed with status 500: {error_message}",
        "Database connection timeout after 5000ms",
        "Kafka produce failed: broker not available — retrying",
        "Unhandled exception in request handler: {error_type}",
        "Circuit breaker OPEN for {service} — too many failures",
        "TLS handshake failed for downstream connection",
    ],
    "FATAL": [
        "Out of memory — process killed by OOM killer",
        "Database connection pool exhausted — all connections busy",
    ],
}

OPERATIONS = [
    "GET /api/v1/users", "POST /api/v1/orders", "GET /api/v1/health",
    "POST /api/v1/payments", "GET /api/v1/inventory", "PUT /api/v1/users/{id}",
    "DELETE /api/v1/orders/{id}", "POST /api/v1/auth/login",
    "GET /api/v1/metrics", "POST /api/v1/webhooks",
]

# State
_running = False
_anomaly_injection_counter = 0
_ws_clients: list = []  # Will be set by main.py
_incident_count = 0
_anomaly_count = 0


def register_ws_clients(clients: list):
    global _ws_clients
    _ws_clients = clients


async def _generate_log(service: str, db):
    """Generate a single log event."""
    # Weight towards INFO, occasional errors
    weights = [0.6, 0.2, 0.15, 0.05]
    severities = ["INFO", "WARN", "ERROR", "FATAL"]
    severity = random.choices(severities, weights)[0]
    
    templates = LOG_MESSAGES.get(severity, LOG_MESSAGES["INFO"])
    template = random.choice(templates)
    
    message = template.format(
        duration=random.randint(10, 500),
        session_id=uuid.uuid4().hex[:8],
        topic=random.choice(["logs-raw", "metrics-raw", "traces-raw"]),
        offset=random.randint(10000, 999999),
        rows=random.randint(1, 500),
        user_id=f"usr_{random.randint(1000, 9999)}",
        count=random.randint(50, 500),
        pool_usage=random.randint(70, 95),
        attempt=random.randint(1, 3),
        service=random.choice([s["name"] for s in SERVICES]),
        error_message="NullPointerException in OrderHandler",
        error_type="RuntimeError",
        rate=random.randint(800, 1000),
        limit=1000,
    )

    now = datetime.now(timezone.utc)
    event_id = str(uuid.uuid4())
    trace_id = uuid.uuid4().hex[:32] if random.random() > 0.3 else None
    span_id = uuid.uuid4().hex[:16] if trace_id else None

    await db.execute(
        """INSERT INTO logs (event_id, timestamp, service_name, severity, message,
           trace_id, span_id, body_format, resource_attributes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'text', '{}')""",
        (event_id, now.isoformat(), service, severity, message, trace_id, span_id)
    )
    return trace_id, span_id


async def _generate_trace(service: str, trace_id: str, db):
    """Generate trace spans for a request."""
    now = datetime.now(timezone.utc)
    operation = random.choice(OPERATIONS)
    duration = random.randint(5, 300)
    
    span_id = uuid.uuid4().hex[:16]
    start_time = now - timedelta(milliseconds=duration)
    status = random.choices(["OK", "ERROR"], [0.92, 0.08])[0]

    await db.execute(
        """INSERT INTO traces (trace_id, span_id, parent_span_id, service_name,
           operation_name, start_time, end_time, duration_ms, status_code, attributes)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, '{}')""",
        (trace_id, span_id, service, operation,
         start_time.isoformat(), now.isoformat(), duration, status)
    )


async def _generate_metrics(service: str, service_def: dict, db, inject_anomaly: bool = False):
    """Generate metric data points and run detection."""
    global _anomaly_count, _incident_count
    now = datetime.now(timezone.utc)
    
    alert_config = await _get_alert_config(service, db)

    for metric_name in service_def["metrics"]:
        baseline = METRIC_BASELINES[metric_name]
        
        # Normal value with some noise
        value = random.gauss(baseline["mean"], baseline["std"])
        
        # Inject anomaly: spike the value dramatically
        if inject_anomaly and metric_name == service_def["metrics"][0]:
            spike_factor = random.uniform(4.0, 8.0)
            value = baseline["mean"] + spike_factor * baseline["std"]

        value = max(0, value)  # No negative values
        
        metric_id = str(uuid.uuid4())
        event = MetricEvent(
            metric_id=metric_id,
            timestamp=now.isoformat(),
            service_name=service,
            metric_name=metric_name,
            value=value,
            unit=baseline.get("unit"),
            metric_type="gauge",
            tags={},
        )

        # Store metric
        await db.execute(
            """INSERT INTO metrics (metric_id, timestamp, service_name, metric_name,
               value, unit, metric_type, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?, '{}')""",
            (metric_id, now.isoformat(), service, metric_name, value, baseline.get("unit"), "gauge")
        )

        # Run detection
        anomaly = await detect_anomaly(event, alert_config)
        if anomaly:
            _anomaly_count += 1
            # Store anomaly event
            await db.execute(
                """INSERT INTO anomaly_events
                   (id, service_name, detected_at, anomaly_type, severity,
                    metric_name, observed_value, baseline_value, z_score,
                    context_window_start, context_window_end, dedup_key,
                    suppressed_by_cooldown, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    anomaly.id, anomaly.service_name, anomaly.detected_at,
                    anomaly.anomaly_type.value, anomaly.severity.value,
                    anomaly.metric_name, anomaly.observed_value, anomaly.baseline_value,
                    anomaly.z_score, anomaly.context_window_start, anomaly.context_window_end,
                    anomaly.dedup_key, 1 if anomaly.suppressed_by_cooldown else 0,
                    anomaly.created_at,
                )
            )
            await db.commit()

            # If CRITICAL and not suppressed, generate RCA
            if anomaly.severity == SeverityLevel.CRITICAL and not anomaly.suppressed_by_cooldown:
                try:
                    incident, _ = await generate_rca(anomaly)
                    _incident_count += 1
                    print(f"  [INCIDENT] {service}/{metric_name} -- z={anomaly.z_score}")
                    
                    # Push to WebSocket clients
                    await _broadcast_incident(incident)
                except Exception as e:
                    print(f"  [ERROR] RCA failed: {e}")

    await db.commit()


async def _get_alert_config(service: str, db) -> dict:
    """Get alert config for a service, falling back to __default__."""
    row = await db.execute_fetchone(
        "SELECT * FROM alert_configs WHERE service_name = ?", (service,)
    )
    if row:
        return dict(row)
    row = await db.execute_fetchone(
        "SELECT * FROM alert_configs WHERE service_name = '__default__'"
    )
    return dict(row) if row else {
        "zscore_threshold_critical": 3.0,
        "zscore_threshold_warning": 2.0,
        "iqr_multiplier": 1.5,
        "cooldown_minutes": 5,
        "direction_sensitivity": "both",
    }


async def _broadcast_incident(incident: dict):
    """Push incident to all connected WebSocket clients."""
    if not _ws_clients:
        return
    msg = json.dumps({"type": "incident", "payload": incident})
    disconnected = []
    for ws in _ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _ws_clients.remove(ws)


async def run_simulator():
    """Main simulator loop — generates telemetry every 2 seconds."""
    global _running, _anomaly_injection_counter
    _running = True
    
    print("[START] Telemetry simulator starting...")
    print(f"   Simulating {len(SERVICES)} services")
    print(f"   Generating data every 2 seconds")
    print(f"   Anomaly injection every ~30 seconds")
    
    cycle = 0
    while _running:
        try:
            db = await get_db()
            cycle += 1
            
            # Inject anomaly every ~15 cycles (30 seconds)
            inject_anomaly = (cycle % 15 == 0) and cycle > 50  # Wait for baseline warmup
            
            if inject_anomaly:
                target_service = random.choice(SERVICES)
                _anomaly_injection_counter += 1
                print(f"\n[INJECT] Anomaly #{_anomaly_injection_counter} into {target_service['name']}")

            for svc in SERVICES:
                should_inject = inject_anomaly and svc["name"] == target_service["name"] if inject_anomaly else False
                
                # Generate logs (2-5 per cycle per service)
                for _ in range(random.randint(2, 5)):
                    trace_id, span_id = await _generate_log(svc["name"], db)
                    if trace_id:
                        await _generate_trace(svc["name"], trace_id, db)
                
                # Generate metrics
                await _generate_metrics(svc["name"], svc, db, inject_anomaly=should_inject)

            await db.commit()
            
            # Progress indicator every 10 cycles
            if cycle % 10 == 0:
                print(f"  [STATS] Cycle {cycle} | Anomalies: {_anomaly_count} | Incidents: {_incident_count}")

            # Clean old data (keep last 2 hours for local mode)
            if cycle % 100 == 0:
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
                await db.execute("DELETE FROM logs WHERE timestamp < ?", (cutoff,))
                await db.execute("DELETE FROM metrics WHERE timestamp < ?", (cutoff,))
                await db.execute("DELETE FROM traces WHERE start_time < ?", (cutoff,))
                await db.commit()

            await asyncio.sleep(2)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"  [ERROR] Simulator error: {e}")
            await asyncio.sleep(5)
    
    print("[STOP] Simulator stopped")


def stop_simulator():
    global _running
    _running = False


def get_stats() -> dict:
    return {
        "running": _running,
        "services": len(SERVICES),
        "anomaly_count": _anomaly_count,
        "incident_count": _incident_count,
        "injection_count": _anomaly_injection_counter,
    }
