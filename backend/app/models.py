"""
Pydantic models matching the TRD v2 schema.
Used for API request/response validation and internal data transfer.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ── Enums ───────────────────────────────────────────
class SeverityLevel(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"

class AnomalyType(str, Enum):
    METRIC_SPIKE = "metric_spike"
    ERROR_RATE = "error_rate"
    LATENCY = "latency"
    LOG_PATTERN = "log_pattern"

class MetricType(str, Enum):
    GAUGE = "gauge"
    COUNTER = "counter"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"

class SpanStatus(str, Enum):
    OK = "OK"
    ERROR = "ERROR"
    UNSET = "UNSET"


# ── Telemetry Events ───────────────────────────────
class LogEvent(BaseModel):
    event_id: str
    timestamp: str
    service_name: str
    severity: str
    message: str
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    body_format: str = "text"
    resource_attributes: dict = {}

class TraceSpan(BaseModel):
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    service_name: str
    operation_name: str
    start_time: str
    end_time: str
    duration_ms: int
    status_code: str = "OK"
    attributes: dict = {}

class MetricEvent(BaseModel):
    metric_id: str
    timestamp: str
    service_name: str
    metric_name: str
    value: float
    unit: Optional[str] = None
    metric_type: str = "gauge"
    tags: dict = {}


# ── Anomaly & Incident ─────────────────────────────
class AnomalyEvent(BaseModel):
    id: str
    service_name: str
    detected_at: str
    anomaly_type: AnomalyType
    severity: SeverityLevel
    metric_name: Optional[str] = None
    observed_value: Optional[float] = None
    baseline_value: Optional[float] = None
    z_score: Optional[float] = None
    context_window_start: str
    context_window_end: str
    dedup_key: str
    incident_id: Optional[str] = None
    suppressed_by_cooldown: bool = False
    created_at: str

class RCAResponse(BaseModel):
    """LLM RCA output — validated per TRD §7.3"""
    root_cause: str = Field(max_length=200)
    contributing_factors: list[str] = Field(min_length=1, max_length=10)
    remediation_steps: list[str] = Field(min_length=1, max_length=10)
    confidence_score: float = Field(ge=0.0, le=1.0)

class IncidentReport(BaseModel):
    id: str
    service_name: str
    detected_at: str
    severity: SeverityLevel
    anomaly_type: AnomalyType
    observed_value: Optional[float] = None
    baseline_value: Optional[float] = None
    z_score: Optional[float] = None
    metric_name: Optional[str] = None
    root_cause: str
    contributing_factors: list[str] = []
    remediation_steps: list[str] = []
    confidence_score: Optional[float] = None
    llm_model: str
    llm_attempts: int = 1
    llm_fallback_used: bool = False
    llm_latency_ms: Optional[int] = None
    resolved_at: Optional[str] = None
    auto_resolved: bool = False
    user_rating: Optional[int] = None
    created_at: str
    updated_at: str


# ── Alert Config ────────────────────────────────────
class AlertConfigRequest(BaseModel):
    service_name: str
    zscore_threshold_critical: float = Field(default=3.0, gt=0)
    zscore_threshold_warning: float = Field(default=2.0, gt=0)
    iqr_multiplier: float = Field(default=1.5, gt=0)
    baseline_window_minutes: int = Field(default=60, ge=10)
    min_anomaly_duration_secs: int = Field(default=30)
    direction_sensitivity: str = Field(default="both")
    cooldown_minutes: int = Field(default=5, ge=1)
    enabled: bool = True

class AlertConfigResponse(BaseModel):
    id: str
    service_name: str
    zscore_threshold_critical: float
    zscore_threshold_warning: float
    iqr_multiplier: float
    baseline_window_minutes: int
    min_anomaly_duration_secs: int
    direction_sensitivity: str
    cooldown_minutes: int
    enabled: bool
    created_at: str
    updated_at: str


# ── Health ──────────────────────────────────────────
class HealthCheck(BaseModel):
    status: str  # healthy | degraded | unhealthy
    version: str = "2.0.0"
    checks: dict = {}
    uptime_seconds: float = 0

class ServiceStatus(BaseModel):
    service_name: str
    status: str  # healthy | warning | critical
    last_seen: str
    incident_count_24h: int = 0
    anomaly_count_24h: int = 0


# ── API Response Envelope ───────────────────────────
class APIResponse(BaseModel):
    status: str = "ok"
    data: object = None
    meta: Optional[dict] = None

class APIError(BaseModel):
    status: str = "error"
    code: str
    message: str


# ── Rating ──────────────────────────────────────────
class RatingRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
