-- ============================================================
--  DISTRIBUTED OBSERVABILITY CO-PILOT
--  Complete Backend Schema  |  v1.0
--  Sources: PRD v1.0, TRD v1.0, App Flow doc
-- ============================================================
--
--  Structure
--  ─────────
--  SECTION 1  PostgreSQL — Relational / Transactional Store
--  SECTION 2  ClickHouse — Time-Series / Columnar Store
--  SECTION 3  Redis Key Patterns — Baseline Store
--  SECTION 4  Kafka Topic Manifest
--  SECTION 5  Indexes, Constraints & Maintenance Jobs
--  SECTION 6  Seed / Reference Data
-- ============================================================


-- ============================================================
--  SECTION 1: PostgreSQL  (ACID store — incidents, config, auth)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Extensions
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_cron";       -- scheduled retention sweep


-- ────────────────────────────────────────────────────────────
-- ENUM types
-- ────────────────────────────────────────────────────────────
CREATE TYPE severity_level   AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE anomaly_type_enum AS ENUM ('metric_spike', 'error_rate', 'latency', 'log_pattern');
CREATE TYPE log_severity     AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');
CREATE TYPE metric_type_enum AS ENUM ('gauge', 'counter', 'histogram', 'summary');
CREATE TYPE span_status_enum AS ENUM ('OK', 'ERROR', 'UNSET');
CREATE TYPE body_format_enum AS ENUM ('json', 'text', 'protobuf');


-- ────────────────────────────────────────────────────────────
-- 1.1  raw_contexts
--      Stores the assembled telemetry window that was sent to
--      the LLM.  Referenced by incidents.raw_context_id.
-- ────────────────────────────────────────────────────────────
CREATE TABLE raw_contexts (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- the anomaly that triggered context assembly
    anomaly_id          UUID            NOT NULL,

    -- the precise window fetched
    window_start        TIMESTAMPTZ     NOT NULL,
    window_end          TIMESTAMPTZ     NOT NULL,

    -- raw blobs sent to the LLM (stored for audit / reprocessing)
    log_lines           JSONB           NOT NULL DEFAULT '[]',   -- array of log line objects
    trace_spans         JSONB           NOT NULL DEFAULT '[]',   -- array of span objects
    metric_buckets      JSONB           NOT NULL DEFAULT '[]',   -- array of 1-min aggregated metric rows

    log_line_count      SMALLINT        NOT NULL DEFAULT 0,
    span_count          SMALLINT        NOT NULL DEFAULT 0,
    metric_point_count  SMALLINT        NOT NULL DEFAULT 0,

    assembled_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- FK to incidents is set after the incident row is created
    CONSTRAINT chk_window_order CHECK (window_end > window_start)
);

COMMENT ON TABLE raw_contexts IS
    'Immutable telemetry snapshot assembled before each LLM call. '
    'Kept for reproducibility and prompt-replay debugging.';


-- ────────────────────────────────────────────────────────────
-- 1.2  incidents
--      Core table.  One row per detected + RCA-processed anomaly.
-- ────────────────────────────────────────────────────────────
CREATE TABLE incidents (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- originating service
    service_name            VARCHAR(128)    NOT NULL,

    -- detection metadata
    detected_at             TIMESTAMPTZ     NOT NULL,
    severity                severity_level  NOT NULL,
    anomaly_type            anomaly_type_enum NOT NULL,

    -- raw anomaly signal values
    observed_value          FLOAT4          ,
    baseline_value          FLOAT4          ,
    z_score                 FLOAT4          ,   -- NULL for IQR-based detections
    metric_name             VARCHAR(256)    ,   -- populated for metric_spike type

    -- AI-generated root cause analysis
    root_cause              TEXT            NOT NULL,
    contributing_factors    JSONB           NOT NULL DEFAULT '[]',  -- string[]
    remediation_steps       JSONB           NOT NULL DEFAULT '[]',  -- string[]
    confidence_score        FLOAT4          CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),

    -- LLM invocation metadata
    llm_model               VARCHAR(64)     NOT NULL,               -- e.g. claude-sonnet-4-6
    llm_attempts            SMALLINT        NOT NULL DEFAULT 1,     -- 1–3 (retries)
    llm_fallback_used       BOOLEAN         NOT NULL DEFAULT FALSE,
    llm_latency_ms          INTEGER         ,                       -- wall-clock ms for the winning call
    websocket_sent_at       TIMESTAMPTZ     ,                       -- for RCA-generation SLO measurement

    -- context window FK
    raw_context_id          UUID            REFERENCES raw_contexts(id) ON DELETE SET NULL,

    -- lifecycle
    resolved_at             TIMESTAMPTZ     ,
    auto_resolved           BOOLEAN         NOT NULL DEFAULT FALSE,

    -- user feedback
    user_rating             SMALLINT        CHECK (user_rating >= 1 AND user_rating <= 5),
    user_rating_at          TIMESTAMPTZ     ,

    -- audit
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resolved_after_detected
        CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);

COMMENT ON TABLE incidents IS
    'One row per anomaly that reached the LLM RCA layer (CRITICAL severity). '
    'WARNING-only anomalies are recorded in anomaly_events.';

COMMENT ON COLUMN incidents.llm_fallback_used IS
    'TRUE when all 3 LLM retry attempts failed and the template-based fallback was used.';
COMMENT ON COLUMN incidents.websocket_sent_at IS
    'Populated when the incident.created WebSocket message is dispatched. '
    'Used to measure the < 30s detection-to-push SLO.';


-- ────────────────────────────────────────────────────────────
-- 1.3  anomaly_events
--      All anomalies (WARNING + CRITICAL) persisted here.
--      CRITICAL ones also have a corresponding incidents row.
-- ────────────────────────────────────────────────────────────
CREATE TABLE anomaly_events (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    service_name        VARCHAR(128)    NOT NULL,
    detected_at         TIMESTAMPTZ     NOT NULL,
    anomaly_type        anomaly_type_enum NOT NULL,
    severity            severity_level  NOT NULL,
    metric_name         VARCHAR(256)    ,
    observed_value      FLOAT4          ,
    baseline_value      FLOAT4          ,
    z_score             FLOAT4          ,
    context_window_start TIMESTAMPTZ    NOT NULL,
    context_window_end  TIMESTAMPTZ     NOT NULL,

    -- deduplication key (hash of service + metric + 5-min bucket)
    dedup_key           VARCHAR(128)    NOT NULL,

    -- link to incidents table for CRITICAL events that triggered LLM
    incident_id         UUID            REFERENCES incidents(id) ON DELETE SET NULL,

    -- cooldown state
    suppressed_by_cooldown BOOLEAN      NOT NULL DEFAULT FALSE,

    kafka_offset        BIGINT          ,   -- for traceability back to anomalies-detected topic
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE anomaly_events IS
    'Raw anomaly log (all severities). WARNING events stop here; CRITICAL events '
    'continue to the LLM and produce an incidents row.';


-- ────────────────────────────────────────────────────────────
-- 1.4  alert_configs
--      Per-service alert threshold configuration.
--      POST /api/v1/alerts/config writes here.
-- ────────────────────────────────────────────────────────────
CREATE TABLE alert_configs (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    service_name                VARCHAR(128) NOT NULL,
    CONSTRAINT uq_alert_config_service UNIQUE (service_name),

    -- Z-score thresholds
    zscore_threshold_critical   FLOAT4      NOT NULL DEFAULT 3.0
                                            CHECK (zscore_threshold_critical > 0),
    zscore_threshold_warning    FLOAT4      NOT NULL DEFAULT 2.0
                                            CHECK (zscore_threshold_warning > 0),

    -- IQR multiplier for log error-rate detection
    iqr_multiplier              FLOAT4      NOT NULL DEFAULT 1.5
                                            CHECK (iqr_multiplier > 0),

    -- baseline tracking
    baseline_window_minutes     SMALLINT    NOT NULL DEFAULT 60
                                            CHECK (baseline_window_minutes >= 10),
    min_anomaly_duration_secs   SMALLINT    NOT NULL DEFAULT 30,
    direction_sensitivity       VARCHAR(16) NOT NULL DEFAULT 'both'
                                            CHECK (direction_sensitivity IN ('both', 'upper', 'lower')),

    -- alert storm prevention
    cooldown_minutes            SMALLINT    NOT NULL DEFAULT 5
                                            CHECK (cooldown_minutes >= 1),

    enabled                     BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alert_configs IS
    'One row per monitored service. Missing rows fall back to system-wide defaults. '
    'Created/updated via POST /api/v1/alerts/config.';


-- ────────────────────────────────────────────────────────────
-- 1.5  api_keys
--      API key store.  Plaintext key shown once at creation;
--      only bcrypt hash persisted.
-- ────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash        VARCHAR(72) NOT NULL UNIQUE,   -- bcrypt(key, cost=12)
    name            VARCHAR(128) NOT NULL,          -- human label (e.g. "dashboard-prod")
    created_by      VARCHAR(128),
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_keys IS
    'Phase-1 API key auth. Phase-2 will add JWT; middleware is designed for both. '
    'key_hash is bcrypt at cost factor 12. Plaintext is never stored.';


-- ────────────────────────────────────────────────────────────
-- 1.6  dlq_events
--      Dead Letter Queue records for Kafka events that failed
--      Pydantic validation. Stored for debugging / reprocessing.
-- ────────────────────────────────────────────────────────────
CREATE TABLE dlq_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_topic    VARCHAR(128) NOT NULL,   -- e.g. logs-raw
    kafka_partition INTEGER     NOT NULL,
    kafka_offset    BIGINT      NOT NULL,
    raw_payload     TEXT        NOT NULL,    -- the raw bytes that failed validation
    error_message   TEXT        NOT NULL,    -- Pydantic validation error
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed        BOOLEAN     NOT NULL DEFAULT FALSE,
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     VARCHAR(128)
);

COMMENT ON TABLE dlq_events IS
    'Records every Kafka event routed to a DLQ topic due to validation failure. '
    'Supports manual inspection and selective reprocessing.';


-- ────────────────────────────────────────────────────────────
-- 1.7  system_health_snapshots
--      Periodic snapshots from GET /api/v1/health for trending.
-- ────────────────────────────────────────────────────────────
CREATE TABLE system_health_snapshots (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    kafka_ok            BOOLEAN     NOT NULL,
    clickhouse_ok       BOOLEAN     NOT NULL,
    postgres_ok         BOOLEAN     NOT NULL,
    redis_ok            BOOLEAN     NOT NULL,
    llm_reachable       BOOLEAN     NOT NULL,

    kafka_consumer_lag  JSONB,      -- { "logs-consumer-group": 42, ... }
    notes               TEXT
);


-- ============================================================
--  SECTION 2: ClickHouse  (columnar time-series — raw telemetry)
-- ============================================================
-- These DDL statements are written in ClickHouse SQL dialect.
-- Run against ClickHouse, not PostgreSQL.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 2.1  logs
-- ────────────────────────────────────────────────────────────
/*
CREATE TABLE logs
(
    event_id            UUID,
    timestamp           DateTime64(3, 'UTC'),
    service_name        LowCardinality(String),
    severity            LowCardinality(String),       -- DEBUG|INFO|WARN|ERROR|FATAL
    message             String,
    trace_id            Nullable(FixedString(32)),     -- hex; null if no active trace
    span_id             Nullable(FixedString(16)),
    body_format         LowCardinality(String),        -- json|text|protobuf
    resource_attributes String                         -- JSON blob
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (service_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 24 HOUR DELETE
SETTINGS index_granularity = 8192;


-- ────────────────────────────────────────────────────────────
-- 2.2  traces
-- ────────────────────────────────────────────────────────────
CREATE TABLE traces
(
    trace_id        FixedString(32),
    span_id         FixedString(16),
    parent_span_id  Nullable(FixedString(16)),
    service_name    LowCardinality(String),
    operation_name  String,
    start_time      DateTime64(3, 'UTC'),
    end_time        DateTime64(3, 'UTC'),
    duration_ms     UInt32,
    status_code     LowCardinality(String),            -- OK|ERROR|UNSET
    attributes      String                             -- JSON blob
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(start_time)
ORDER BY (service_name, start_time, trace_id)
TTL toDateTime(start_time) + INTERVAL 24 HOUR DELETE
SETTINGS index_granularity = 8192;


-- ────────────────────────────────────────────────────────────
-- 2.3  metrics
-- ────────────────────────────────────────────────────────────
CREATE TABLE metrics
(
    metric_id       UUID,
    timestamp       DateTime64(3, 'UTC'),
    service_name    LowCardinality(String),
    metric_name     LowCardinality(String),
    value           Float64,
    unit            LowCardinality(Nullable(String)),
    metric_type     LowCardinality(String),            -- gauge|counter|histogram|summary
    tags            String                             -- JSON blob
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (service_name, metric_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 24 HOUR DELETE
SETTINGS index_granularity = 8192;


-- ────────────────────────────────────────────────────────────
-- 2.4  metrics_minutely_mv
--      Materialised view: pre-aggregated 1-minute metric buckets.
--      Used by the correlation engine context assembly when > 500
--      raw points exist in the 30-minute window.
-- ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW metrics_minutely_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(bucket)
ORDER BY (service_name, metric_name, bucket)
TTL bucket + INTERVAL 24 HOUR DELETE
AS
SELECT
    service_name,
    metric_name,
    toStartOfMinute(timestamp)          AS bucket,
    avgState(value)                     AS avg_value,
    maxState(value)                     AS max_value,
    minState(value)                     AS min_value,
    quantileState(0.95)(value)          AS p95_value,
    countState()                        AS sample_count
FROM metrics
GROUP BY service_name, metric_name, bucket;
*/


-- ============================================================
--  SECTION 3: Redis Key Patterns
--  (Baseline store for anomaly detection engine)
-- ============================================================
--
--  All keys are prefixed with  copilot:baseline:
--
--  KEY PATTERN                                   TYPE    TTL        CONTENT
--  ─────────────────────────────────────────────────────────────────────────
--
--  copilot:baseline:{service}:{metric_name}      Hash    2h         Welford running stats
--    Fields:
--      n          Integer    sample count
--      mean       Float      running mean
--      M2         Float      sum of squared deviations (for stddev)
--      last_ts    ISO8601    timestamp of most recent sample
--
--  copilot:baseline:{service}:log_error_rate     List    2h         Sliding 60-min log-error-rate
--    Members:    JSON strings {ts, error_count, total_count}
--    Max len:    60 entries (one per minute bucket; oldest trimmed with LTRIM)
--
--  copilot:cooldown:{service}:{anomaly_type}     String  configurable (default 300s)
--    Value:      "1"  (present = in cooldown; key expiry enforces the window)
--
--  copilot:dedup:{dedup_key}                     String  300s
--    Value:      anomaly_id  (prevents re-publishing same anomaly within 5-min bucket)
--
--  copilot:ws:connections                        Set     no TTL
--    Members:    websocket_client_id strings (maintained by FastAPI WS manager)
--
-- ============================================================


-- ============================================================
--  SECTION 4: Kafka Topic Manifest
--  (Reference data — topics must be pre-created before consumers start)
-- ============================================================
--
--  TOPIC NAME            PARTITIONS  REP FACTOR  RETENTION   PARTITION KEY               MAX MSG SIZE
--  ─────────────────────────────────────────────────────────────────────────────────────────────────
--  logs-raw              12          3           24h         service_name                1 MB
--  traces-raw             6          3           24h         trace_id                    2 MB
--  metrics-raw           12          3           24h         metric_name + service_name  512 KB
--  anomalies-detected     3          3            7d         service_name                256 KB
--  dlq-logs               3          3           72h         service_name                1 MB
--  dlq-traces             3          3           72h         trace_id                    2 MB
--  dlq-metrics            3          3           72h         metric_name                 512 KB
--
--  Broker-level settings (set in server.properties / docker-compose env):
--    min.insync.replicas               = 2
--    unclean.leader.election.enable    = false
--    auto.create.topics.enable         = false
--    log.retention.check.interval.ms   = 300000
--    compression.type                  = lz4 (all topics)
--
--  Producer settings (all producers):
--    acks                              = all
--    enable.idempotence                = true
--    max.in.flight.requests.per.connection = 5
-- ============================================================


-- ============================================================
--  SECTION 5: PostgreSQL Indexes, Triggers & Maintenance Jobs
-- ============================================================

-- ── incidents ───────────────────────────────────────────────
CREATE INDEX idx_incidents_service_name    ON incidents (service_name);
CREATE INDEX idx_incidents_detected_at     ON incidents (detected_at DESC);
CREATE INDEX idx_incidents_severity        ON incidents (severity);
CREATE INDEX idx_incidents_service_time    ON incidents (service_name, detected_at DESC);
CREATE INDEX idx_incidents_unresolved      ON incidents (detected_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_incidents_raw_context     ON incidents (raw_context_id) WHERE raw_context_id IS NOT NULL;

-- ── anomaly_events ──────────────────────────────────────────
CREATE INDEX idx_anomaly_events_service       ON anomaly_events (service_name);
CREATE INDEX idx_anomaly_events_detected_at   ON anomaly_events (detected_at DESC);
CREATE INDEX idx_anomaly_events_severity      ON anomaly_events (severity);
CREATE INDEX idx_anomaly_events_dedup_key     ON anomaly_events (dedup_key);
CREATE INDEX idx_anomaly_events_incident      ON anomaly_events (incident_id) WHERE incident_id IS NOT NULL;

-- ── alert_configs ────────────────────────────────────────────
-- UNIQUE constraint already covers the primary lookup path; no extra index needed.

-- ── api_keys ─────────────────────────────────────────────────
CREATE INDEX idx_api_keys_active ON api_keys (key_hash) WHERE revoked_at IS NULL;

-- ── dlq_events ───────────────────────────────────────────────
CREATE INDEX idx_dlq_events_topic       ON dlq_events (source_topic);
CREATE INDEX idx_dlq_events_unreviewed  ON dlq_events (received_at DESC) WHERE reviewed = FALSE;

-- ── system_health_snapshots ──────────────────────────────────
CREATE INDEX idx_health_snapshots_time  ON system_health_snapshots (snapshot_at DESC);


-- ── Auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_alert_configs_updated_at
    BEFORE UPDATE ON alert_configs
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- ── Retention sweep (pg_cron) ────────────────────────────────
-- Removes incidents older than 90 days (TRD §6.3).
-- Cron expression: midnight daily.
SELECT cron.schedule(
    'incidents-retention-sweep',
    '0 0 * * *',
    $$
        DELETE FROM incidents
        WHERE  created_at < NOW() - INTERVAL '90 days';

        DELETE FROM anomaly_events
        WHERE  created_at < NOW() - INTERVAL '90 days';

        DELETE FROM raw_contexts
        WHERE  assembled_at < NOW() - INTERVAL '90 days';

        DELETE FROM dlq_events
        WHERE  received_at < NOW() - INTERVAL '7 days'
          AND  reviewed = TRUE;

        DELETE FROM system_health_snapshots
        WHERE  snapshot_at < NOW() - INTERVAL '30 days';
    $$
);


-- ============================================================
--  SECTION 6: Seed / Reference Data
-- ============================================================

-- Default global alert configuration
-- Individual services override via POST /api/v1/alerts/config.
INSERT INTO alert_configs (
    id,
    service_name,
    zscore_threshold_critical,
    zscore_threshold_warning,
    iqr_multiplier,
    baseline_window_minutes,
    min_anomaly_duration_secs,
    cooldown_minutes,
    enabled
) VALUES (
    gen_random_uuid(),
    '__default__',          -- sentinel value consumed by detection engine when no per-service row exists
    3.0,
    2.0,
    1.5,
    60,
    30,
    5,
    TRUE
) ON CONFLICT (service_name) DO NOTHING;


-- ============================================================
--  END OF SCHEMA
-- ============================================================
--
--  Quick reference — table / store  →  responsibility
--  ───────────────────────────────────────────────────
--  PostgreSQL: incidents          Core incident + RCA records (90-day retention)
--  PostgreSQL: anomaly_events     All anomaly signals (WARNING + CRITICAL)
--  PostgreSQL: raw_contexts       Telemetry snapshots sent to LLM
--  PostgreSQL: alert_configs      Per-service detection thresholds
--  PostgreSQL: api_keys           Auth (Phase 1: API key; Phase 2: JWT-ready)
--  PostgreSQL: dlq_events         Dead-letter queue audit trail
--  PostgreSQL: system_health_*    Health check trending
--  ClickHouse: logs               Raw log events (24h TTL, MergeTree columnar)
--  ClickHouse: traces             Raw span events (24h TTL, MergeTree columnar)
--  ClickHouse: metrics            Raw metric events (24h TTL, MergeTree columnar)
--  ClickHouse: metrics_minutely_mv 1-min pre-aggregated buckets (materialised view)
--  Redis:      baseline:*         Welford running stats per service/metric
--  Redis:      cooldown:*         Alert storm prevention keys (TTL-based)
--  Redis:      dedup:*            Deduplication keys (5-min bucket, TTL-based)
--  Kafka:      logs/traces/metrics-raw  24h ingest buffer (12/6/12 partitions)
--  Kafka:      anomalies-detected       7-day anomaly event bus (3 partitions)
--  Kafka:      dlq-*                    72h dead letter queue per signal type
-- ============================================================
