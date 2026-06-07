"""
Correlation / RCA Engine — Template-based root cause analysis.
Assembles telemetry context and generates RCA per TRD §7.
"""

import json
import time
import uuid
from datetime import datetime, timezone

from .database import get_db
from .models import AnomalyEvent, RCAResponse, SeverityLevel


# ── Template RCA generator (fallback mode — no LLM key needed) ──

_RCA_TEMPLATES = {
    "metric_spike": {
        "http_request_duration_ms": RCAResponse(
            root_cause="HTTP request latency spike detected — likely caused by downstream service degradation or database connection pool exhaustion",
            contributing_factors=[
                "Increased p99 latency correlates with connection pool saturation",
                "Upstream retry storms amplifying load on the service",
                "Garbage collection pauses during high-throughput window",
            ],
            remediation_steps=[
                "Scale horizontal replicas for the affected service",
                "Increase database connection pool size",
                "Implement circuit breaker on downstream calls",
                "Review GC tuning parameters",
            ],
            confidence_score=0.72,
        ),
        "cpu_usage_percent": RCAResponse(
            root_cause="CPU utilisation exceeded safe threshold — triggered by compute-intensive request pattern or thread pool exhaustion",
            contributing_factors=[
                "Spike in concurrent request volume saturating thread pool",
                "CPU-bound JSON serialisation on large payloads",
                "Background cron jobs competing for CPU cycles",
            ],
            remediation_steps=[
                "Increase CPU resource limits for the container",
                "Enable request queuing with backpressure",
                "Offload heavy serialisation to worker threads",
                "Reschedule background jobs to off-peak hours",
            ],
            confidence_score=0.68,
        ),
        "memory_usage_bytes": RCAResponse(
            root_cause="Memory usage spike — potential memory leak in request handler or unbounded cache growth",
            contributing_factors=[
                "In-memory cache growing without eviction policy",
                "Large response payloads held in memory during streaming",
                "Connection objects not being released after timeout",
            ],
            remediation_steps=[
                "Implement LRU cache eviction with max size limit",
                "Enable streaming response for large payloads",
                "Add connection pool cleanup on timeout",
                "Schedule memory profiling in next maintenance window",
            ],
            confidence_score=0.65,
        ),
        "throughput_rps": RCAResponse(
            root_cause="Throughput anomaly detected — request rate deviation from baseline indicates traffic pattern change",
            contributing_factors=[
                "Sudden traffic surge from upstream load balancer redistribution",
                "Client retry storm after partial service degradation",
                "Batch job triggering burst of API calls",
            ],
            remediation_steps=[
                "Verify load balancer health check configuration",
                "Implement client-side exponential backoff",
                "Add rate limiting at API gateway level",
                "Scale auto-scaling group min instances",
            ],
            confidence_score=0.70,
        ),
    },
    "error_rate": {
        "_default": RCAResponse(
            root_cause="Error rate spike detected — elevated failure rate across service endpoints suggesting systemic issue",
            contributing_factors=[
                "Dependency service returning 5xx errors",
                "Database connection timeouts under load",
                "Configuration change deployed without proper validation",
            ],
            remediation_steps=[
                "Check dependency service health dashboards",
                "Verify database connection pool status",
                "Review recent deployment changelog",
                "Enable verbose logging for error categorisation",
            ],
            confidence_score=0.62,
        ),
    },
    "latency": {
        "_default": RCAResponse(
            root_cause="End-to-end latency degradation — slowdown traced to database query layer and network I/O",
            contributing_factors=[
                "Missing database index causing full table scans",
                "Network congestion between availability zones",
                "Connection pool exhaustion causing request queuing",
            ],
            remediation_steps=[
                "Analyse slow query log and add missing indexes",
                "Check inter-AZ network metrics",
                "Increase connection pool size and add monitoring",
            ],
            confidence_score=0.75,
        ),
    },
}


async def generate_rca(anomaly: AnomalyEvent) -> tuple[dict, str]:
    """
    Generate RCA for a CRITICAL anomaly.
    Returns (incident_dict, raw_context_id).
    
    In production, this would call an LLM. We use template-based fallback.
    """
    start_ms = time.time()
    db = await get_db()
    now = datetime.now(timezone.utc)

    # ── Step 1: Assemble context (TRD §7.1) ──
    raw_context_id = str(uuid.uuid4())
    
    # Fetch recent logs
    logs_rows = await db.execute_fetchall(
        """SELECT * FROM logs WHERE service_name = ? 
           AND timestamp >= ? ORDER BY timestamp DESC LIMIT 200""",
        (anomaly.service_name, anomaly.context_window_start)
    )
    log_lines = [dict(r) for r in logs_rows] if logs_rows else []

    # Fetch trace spans
    trace_rows = await db.execute_fetchall(
        """SELECT * FROM traces WHERE service_name = ? 
           AND start_time >= ? AND start_time <= ?
           ORDER BY start_time DESC""",
        (anomaly.service_name, anomaly.context_window_start, anomaly.context_window_end)
    )
    trace_spans = [dict(r) for r in trace_rows] if trace_rows else []

    # Fetch metrics (30-min window, 1-min buckets equivalent)
    from datetime import timedelta
    metrics_start = (now - timedelta(minutes=30)).isoformat()
    metric_rows = await db.execute_fetchall(
        """SELECT * FROM metrics WHERE service_name = ?
           AND timestamp >= ? ORDER BY timestamp""",
        (anomaly.service_name, metrics_start)
    )
    metric_buckets = [dict(r) for r in metric_rows] if metric_rows else []

    # Store raw_contexts
    await db.execute(
        """INSERT INTO raw_contexts 
           (id, anomaly_id, window_start, window_end, log_lines, trace_spans, 
            metric_buckets, log_line_count, span_count, metric_point_count, assembled_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            raw_context_id, anomaly.id,
            anomaly.context_window_start, anomaly.context_window_end,
            json.dumps(log_lines), json.dumps(trace_spans),
            json.dumps(metric_buckets),
            len(log_lines), len(trace_spans), len(metric_buckets),
            now.isoformat()
        )
    )

    # ── Step 2: Generate RCA (template fallback) ──
    anomaly_type = anomaly.anomaly_type.value if hasattr(anomaly.anomaly_type, 'value') else anomaly.anomaly_type
    metric = anomaly.metric_name or "_default"
    
    templates = _RCA_TEMPLATES.get(anomaly_type, {})
    rca = templates.get(metric, templates.get("_default", None))
    
    if rca is None:
        rca = RCAResponse(
            root_cause=f"Anomaly detected in {anomaly.service_name}: {anomaly_type} on {metric}",
            contributing_factors=[
                f"Observed value {anomaly.observed_value} deviated from baseline {anomaly.baseline_value}",
                "Further investigation needed to identify root cause",
            ],
            remediation_steps=[
                "Check service logs for error patterns",
                "Review recent deployments and config changes",
                "Monitor the metric for continued deviation",
            ],
            confidence_score=0.45,
        )

    elapsed_ms = int((time.time() - start_ms) * 1000)

    # ── Step 3: Create incident ──
    incident_id = str(uuid.uuid4())
    incident = {
        "id": incident_id,
        "service_name": anomaly.service_name,
        "detected_at": anomaly.detected_at,
        "severity": anomaly.severity.value if hasattr(anomaly.severity, 'value') else anomaly.severity,
        "anomaly_type": anomaly_type,
        "observed_value": anomaly.observed_value,
        "baseline_value": anomaly.baseline_value,
        "z_score": anomaly.z_score,
        "metric_name": anomaly.metric_name,
        "root_cause": rca.root_cause,
        "contributing_factors": json.dumps(rca.contributing_factors),
        "remediation_steps": json.dumps(rca.remediation_steps),
        "confidence_score": rca.confidence_score,
        "llm_model": "template-fallback-v1",
        "llm_attempts": 1,
        "llm_fallback_used": 1,
        "llm_latency_ms": elapsed_ms,
        "raw_context_id": raw_context_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    await db.execute(
        """INSERT INTO incidents
           (id, service_name, detected_at, severity, anomaly_type,
            observed_value, baseline_value, z_score, metric_name,
            root_cause, contributing_factors, remediation_steps, confidence_score,
            llm_model, llm_attempts, llm_fallback_used, llm_latency_ms,
            raw_context_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        tuple(incident.values())
    )

    # Link anomaly_event to incident
    await db.execute(
        "UPDATE anomaly_events SET incident_id = ? WHERE id = ?",
        (incident_id, anomaly.id)
    )

    await db.commit()

    # Return with lists instead of JSON strings for the API
    incident["contributing_factors"] = rca.contributing_factors
    incident["remediation_steps"] = rca.remediation_steps
    incident["llm_fallback_used"] = True

    return incident, raw_context_id
