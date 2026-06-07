"""
Anomaly Detection Engine — Z-score + IQR per TRD §6.
Consumes metric events and detects anomalies.
"""

import hashlib
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from .welford import get_baseline, is_in_cooldown, set_cooldown, check_dedup
from .models import MetricEvent, AnomalyEvent, SeverityLevel, AnomalyType

# IQR sliding window (in-memory, replaces Redis List)
_error_rate_windows: dict[str, list[dict]] = {}

# Metrics that use IQR detection
IQR_METRICS = {"http_error_rate_percent", "failed_job_count", "timeout_count"}


async def detect_anomaly(
    event: MetricEvent,
    config: dict,
) -> Optional[AnomalyEvent]:
    """
    Run anomaly detection on a metric event.
    Returns AnomalyEvent if anomaly detected, None otherwise.
    """
    if event.metric_name in IQR_METRICS:
        return await _detect_iqr(event, config)
    else:
        return await _detect_zscore(event, config)


async def _detect_zscore(event: MetricEvent, config: dict) -> Optional[AnomalyEvent]:
    """Z-score detection for continuous metrics (TRD §6.1)."""
    baseline = get_baseline(event.service_name, event.metric_name)

    # Cold start protection: suppress alerts when n < 100
    if baseline.n < 100:
        baseline.update(event.value)
        return None

    z = baseline.z_score(event.value)

    # Update baseline AFTER computing z-score
    baseline.update(event.value)

    threshold_critical = config.get("zscore_threshold_critical", 3.0)
    threshold_warning = config.get("zscore_threshold_warning", 2.0)
    direction = config.get("direction_sensitivity", "both")

    # Apply direction sensitivity
    abs_z = abs(z)
    if direction == "upper" and z < 0:
        return None
    if direction == "lower" and z > 0:
        return None

    if abs_z < threshold_warning:
        return None

    severity = SeverityLevel.CRITICAL if abs_z >= threshold_critical else SeverityLevel.WARNING

    # Generate dedup key
    now = datetime.now(timezone.utc)
    bucket = now.strftime("%Y%m%d%H%M")[:11]  # 5-min bucket
    dedup_key = hashlib.md5(
        f"{event.service_name}:{event.metric_name}:{bucket}".encode()
    ).hexdigest()[:16]

    # Check dedup
    is_dup = check_dedup(dedup_key)

    # Check cooldown
    in_cooldown = is_in_cooldown(event.service_name, "metric_spike")

    anomaly = AnomalyEvent(
        id=str(uuid.uuid4()),
        service_name=event.service_name,
        detected_at=now.isoformat(),
        anomaly_type=AnomalyType.METRIC_SPIKE,
        severity=severity,
        metric_name=event.metric_name,
        observed_value=round(event.value, 2),
        baseline_value=round(baseline.mean, 2),
        z_score=round(z, 2),
        context_window_start=(now - timedelta(minutes=5)).isoformat(),
        context_window_end=now.isoformat(),
        dedup_key=dedup_key,
        suppressed_by_cooldown=in_cooldown or is_dup,
        created_at=now.isoformat(),
    )

    if not in_cooldown and not is_dup:
        cooldown_mins = config.get("cooldown_minutes", 5)
        set_cooldown(event.service_name, "metric_spike", cooldown_mins * 60)

    return anomaly


async def _detect_iqr(event: MetricEvent, config: dict) -> Optional[AnomalyEvent]:
    """IQR detection for error rates (TRD §6.2)."""
    key = f"{event.service_name}:{event.metric_name}"
    if key not in _error_rate_windows:
        _error_rate_windows[key] = []

    window = _error_rate_windows[key]
    now = datetime.now(timezone.utc)

    # Push current value
    window.append({"ts": now.isoformat(), "value": event.value})
    # Trim to 60 entries
    if len(window) > 60:
        _error_rate_windows[key] = window[-60:]
        window = _error_rate_windows[key]

    if len(window) < 10:
        return None

    values = sorted([w["value"] for w in window])
    n = len(values)
    q1 = values[n // 4]
    q3 = values[3 * n // 4]
    iqr = q3 - q1

    if iqr < 1e-10:
        return None

    multiplier = config.get("iqr_multiplier", 1.5)
    upper_fence = q3 + multiplier * iqr
    extreme_fence = q3 + 3.0 * iqr

    if event.value <= upper_fence:
        return None

    severity = SeverityLevel.CRITICAL if event.value > extreme_fence else SeverityLevel.WARNING

    dedup_key = hashlib.md5(
        f"{event.service_name}:{event.metric_name}:{now.strftime('%Y%m%d%H%M')[:11]}".encode()
    ).hexdigest()[:16]

    is_dup = check_dedup(dedup_key)
    in_cooldown = is_in_cooldown(event.service_name, "error_rate")

    anomaly = AnomalyEvent(
        id=str(uuid.uuid4()),
        service_name=event.service_name,
        detected_at=now.isoformat(),
        anomaly_type=AnomalyType.ERROR_RATE,
        severity=severity,
        metric_name=event.metric_name,
        observed_value=round(event.value, 2),
        baseline_value=round(q3, 2),
        z_score=None,
        context_window_start=(now - timedelta(minutes=5)).isoformat(),
        context_window_end=now.isoformat(),
        dedup_key=dedup_key,
        suppressed_by_cooldown=in_cooldown or is_dup,
        created_at=now.isoformat(),
    )

    if not in_cooldown and not is_dup:
        cooldown_mins = config.get("cooldown_minutes", 5)
        set_cooldown(event.service_name, "error_rate", cooldown_mins * 60)

    return anomaly
