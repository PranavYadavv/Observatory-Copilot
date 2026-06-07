"""
Database layer — SQLite implementation of the Observability Co-Pilot schema.
Adapts the PostgreSQL schema from observability-copilot-schema.sql to SQLite.

Wraps aiosqlite.Connection with convenience methods (execute_fetchone,
execute_fetchall) that the rest of the codebase expects.
"""

import aiosqlite
import os
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "copilot.db"))

_db: "DBConnection | None" = None


class DBConnection:
    """Wrapper around aiosqlite.Connection with convenience methods."""

    def __init__(self, conn: aiosqlite.Connection):
        self._conn = conn

    async def execute(self, sql: str, params=None):
        if params:
            return await self._conn.execute(sql, params)
        return await self._conn.execute(sql)

    async def executescript(self, sql: str):
        return await self._conn.executescript(sql)

    async def execute_fetchone(self, sql: str, params=None):
        if params:
            cursor = await self._conn.execute(sql, params)
        else:
            cursor = await self._conn.execute(sql)
        return await cursor.fetchone()

    async def execute_fetchall(self, sql: str, params=None):
        if params:
            cursor = await self._conn.execute(sql, params)
        else:
            cursor = await self._conn.execute(sql)
        return await cursor.fetchall()

    async def commit(self):
        return await self._conn.commit()

    async def close(self):
        return await self._conn.close()


async def get_db() -> DBConnection:
    global _db
    if _db is None:
        conn = await aiosqlite.connect(DB_PATH)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA foreign_keys=ON")
        _db = DBConnection(conn)
    return _db


async def close_db():
    global _db
    if _db:
        await _db.close()
        _db = None


async def init_db():
    """Create all tables matching the TRD v2 schema (adapted for SQLite)."""
    db = await get_db()

    await db.executescript("""
    -- raw_contexts: Immutable telemetry snapshot assembled before each LLM call
    CREATE TABLE IF NOT EXISTS raw_contexts (
        id                  TEXT PRIMARY KEY,
        anomaly_id          TEXT NOT NULL,
        window_start        TEXT NOT NULL,
        window_end          TEXT NOT NULL,
        log_lines           TEXT NOT NULL DEFAULT '[]',
        trace_spans         TEXT NOT NULL DEFAULT '[]',
        metric_buckets      TEXT NOT NULL DEFAULT '[]',
        log_line_count      INTEGER NOT NULL DEFAULT 0,
        span_count          INTEGER NOT NULL DEFAULT 0,
        metric_point_count  INTEGER NOT NULL DEFAULT 0,
        assembled_at        TEXT NOT NULL
    );

    -- incidents: Core table — one row per detected + RCA-processed anomaly
    CREATE TABLE IF NOT EXISTS incidents (
        id                      TEXT PRIMARY KEY,
        service_name            TEXT NOT NULL,
        detected_at             TEXT NOT NULL,
        severity                TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
        anomaly_type            TEXT NOT NULL CHECK (anomaly_type IN ('metric_spike','error_rate','latency','log_pattern')),
        observed_value          REAL,
        baseline_value          REAL,
        z_score                 REAL,
        metric_name             TEXT,
        root_cause              TEXT NOT NULL,
        contributing_factors    TEXT NOT NULL DEFAULT '[]',
        remediation_steps       TEXT NOT NULL DEFAULT '[]',
        confidence_score        REAL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
        llm_model               TEXT NOT NULL,
        llm_attempts            INTEGER NOT NULL DEFAULT 1,
        llm_fallback_used       INTEGER NOT NULL DEFAULT 0,
        llm_latency_ms          INTEGER,
        websocket_sent_at       TEXT,
        raw_context_id          TEXT REFERENCES raw_contexts(id) ON DELETE SET NULL,
        resolved_at             TEXT,
        auto_resolved           INTEGER NOT NULL DEFAULT 0,
        user_rating             INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
        user_rating_at          TEXT,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
    );

    -- anomaly_events: All anomalies (WARNING + CRITICAL)
    CREATE TABLE IF NOT EXISTS anomaly_events (
        id                      TEXT PRIMARY KEY,
        service_name            TEXT NOT NULL,
        detected_at             TEXT NOT NULL,
        anomaly_type            TEXT NOT NULL CHECK (anomaly_type IN ('metric_spike','error_rate','latency','log_pattern')),
        severity                TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
        metric_name             TEXT,
        observed_value          REAL,
        baseline_value          REAL,
        z_score                 REAL,
        context_window_start    TEXT NOT NULL,
        context_window_end      TEXT NOT NULL,
        dedup_key               TEXT NOT NULL,
        incident_id             TEXT REFERENCES incidents(id) ON DELETE SET NULL,
        suppressed_by_cooldown  INTEGER NOT NULL DEFAULT 0,
        kafka_offset            INTEGER,
        created_at              TEXT NOT NULL
    );

    -- alert_configs: Per-service alert threshold configuration
    CREATE TABLE IF NOT EXISTS alert_configs (
        id                          TEXT PRIMARY KEY,
        service_name                TEXT NOT NULL UNIQUE,
        zscore_threshold_critical   REAL NOT NULL DEFAULT 3.0 CHECK (zscore_threshold_critical > 0),
        zscore_threshold_warning    REAL NOT NULL DEFAULT 2.0 CHECK (zscore_threshold_warning > 0),
        iqr_multiplier              REAL NOT NULL DEFAULT 1.5 CHECK (iqr_multiplier > 0),
        baseline_window_minutes     INTEGER NOT NULL DEFAULT 60 CHECK (baseline_window_minutes >= 10),
        min_anomaly_duration_secs   INTEGER NOT NULL DEFAULT 30,
        direction_sensitivity       TEXT NOT NULL DEFAULT 'both' CHECK (direction_sensitivity IN ('both','upper','lower')),
        cooldown_minutes            INTEGER NOT NULL DEFAULT 5 CHECK (cooldown_minutes >= 1),
        enabled                     INTEGER NOT NULL DEFAULT 1,
        created_at                  TEXT NOT NULL,
        updated_at                  TEXT NOT NULL
    );

    -- api_keys: Phase-1 API key auth
    CREATE TABLE IF NOT EXISTS api_keys (
        id              TEXT PRIMARY KEY,
        key_hash        TEXT NOT NULL UNIQUE,
        name            TEXT NOT NULL,
        created_by      TEXT,
        last_used_at    TEXT,
        revoked_at      TEXT,
        created_at      TEXT NOT NULL
    );

    -- dlq_events: Dead Letter Queue records
    CREATE TABLE IF NOT EXISTS dlq_events (
        id              TEXT PRIMARY KEY,
        source_topic    TEXT NOT NULL,
        kafka_partition INTEGER NOT NULL,
        kafka_offset    INTEGER NOT NULL,
        raw_payload     TEXT NOT NULL,
        error_message   TEXT NOT NULL,
        received_at     TEXT NOT NULL,
        reviewed        INTEGER NOT NULL DEFAULT 0,
        reviewed_at     TEXT,
        reviewed_by     TEXT
    );

    -- system_health_snapshots
    CREATE TABLE IF NOT EXISTS system_health_snapshots (
        id                  TEXT PRIMARY KEY,
        snapshot_at         TEXT NOT NULL,
        kafka_ok            INTEGER NOT NULL,
        clickhouse_ok       INTEGER NOT NULL,
        postgres_ok         INTEGER NOT NULL,
        redis_ok            INTEGER NOT NULL,
        llm_reachable       INTEGER NOT NULL,
        kafka_consumer_lag  TEXT,
        notes               TEXT
    );

    -- Telemetry storage (replaces ClickHouse for local mode)
    CREATE TABLE IF NOT EXISTS logs (
        event_id            TEXT PRIMARY KEY,
        timestamp           TEXT NOT NULL,
        service_name        TEXT NOT NULL,
        severity            TEXT NOT NULL,
        message             TEXT NOT NULL,
        trace_id            TEXT,
        span_id             TEXT,
        body_format         TEXT DEFAULT 'text',
        resource_attributes TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS traces (
        trace_id        TEXT NOT NULL,
        span_id         TEXT PRIMARY KEY,
        parent_span_id  TEXT,
        service_name    TEXT NOT NULL,
        operation_name  TEXT NOT NULL,
        start_time      TEXT NOT NULL,
        end_time        TEXT NOT NULL,
        duration_ms     INTEGER NOT NULL,
        status_code     TEXT DEFAULT 'OK',
        attributes      TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS metrics (
        metric_id       TEXT PRIMARY KEY,
        timestamp       TEXT NOT NULL,
        service_name    TEXT NOT NULL,
        metric_name     TEXT NOT NULL,
        value           REAL NOT NULL,
        unit            TEXT,
        metric_type     TEXT DEFAULT 'gauge',
        tags            TEXT DEFAULT '{}'
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_name);
    CREATE INDEX IF NOT EXISTS idx_incidents_detected ON incidents(detected_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
    CREATE INDEX IF NOT EXISTS idx_anomaly_service ON anomaly_events(service_name);
    CREATE INDEX IF NOT EXISTS idx_anomaly_detected ON anomaly_events(detected_at);
    CREATE INDEX IF NOT EXISTS idx_metrics_service ON metrics(service_name, metric_name, timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service_name, timestamp);
    CREATE INDEX IF NOT EXISTS idx_traces_service ON traces(service_name, start_time);
    """)

    # Seed default alert config
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("""
        INSERT OR IGNORE INTO alert_configs
        (id, service_name, zscore_threshold_critical, zscore_threshold_warning,
         iqr_multiplier, baseline_window_minutes, min_anomaly_duration_secs,
         cooldown_minutes, enabled, created_at, updated_at)
        VALUES (?, '__default__', 3.0, 2.0, 1.5, 60, 30, 5, 1, ?, ?)
    """, (str(__import__('uuid').uuid4()), now, now))

    # Seed a default API key (key: "demo-key-2026")
    import bcrypt
    demo_key = "demo-key-2026"
    key_hash = bcrypt.hashpw(demo_key.encode(), bcrypt.gensalt(rounds=12)).decode()
    await db.execute("""
        INSERT OR IGNORE INTO api_keys (id, key_hash, name, created_by, created_at)
        VALUES (?, ?, 'demo-dashboard', 'system', ?)
    """, (str(__import__('uuid').uuid4()), key_hash, now))

    await db.commit()
    print(f"[OK] Database initialized at {DB_PATH}")
    print(f"[OK] Demo API key: {demo_key}")
