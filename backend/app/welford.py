"""
Welford's online algorithm for running mean and variance.
O(1) time and O(1) memory per data point — per TRD §6.1 / ADR-003.
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class WelfordState:
    """Encodes the full distribution state: n, mean, M2."""
    n: int = 0
    mean: float = 0.0
    M2: float = 0.0
    last_ts: str = ""

    @property
    def variance(self) -> float:
        if self.n < 2:
            return 0.0
        return self.M2 / self.n

    @property
    def stddev(self) -> float:
        return math.sqrt(self.variance)

    def update(self, value: float) -> None:
        """Add a new data point using Welford's recurrence."""
        self.n += 1
        delta = value - self.mean
        self.mean += delta / self.n
        delta2 = value - self.mean
        self.M2 += delta * delta2
        self.last_ts = datetime.now(timezone.utc).isoformat()

    def z_score(self, value: float) -> float:
        """Compute Z-score for a value against this baseline."""
        if self.n < 2 or self.stddev < 1e-10:
            return 0.0
        return (value - self.mean) / self.stddev

    def to_dict(self) -> dict:
        return {
            "n": self.n,
            "mean": self.mean,
            "M2": self.M2,
            "last_ts": self.last_ts,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "WelfordState":
        return cls(
            n=d.get("n", 0),
            mean=d.get("mean", 0.0),
            M2=d.get("M2", 0.0),
            last_ts=d.get("last_ts", ""),
        )


# ── In-memory baseline store (replaces Redis for local mode) ──
_baselines: dict[str, WelfordState] = {}
_cooldowns: dict[str, datetime] = {}
_dedup: dict[str, datetime] = {}


def get_baseline(service: str, metric: str) -> WelfordState:
    key = f"{service}:{metric}"
    if key not in _baselines:
        _baselines[key] = WelfordState()
    return _baselines[key]


def set_cooldown(service: str, anomaly_type: str, seconds: int = 300):
    key = f"{service}:{anomaly_type}"
    _cooldowns[key] = datetime.now(timezone.utc).__class__(
        *datetime.now(timezone.utc).timetuple()[:6],
        tzinfo=timezone.utc
    )
    from datetime import timedelta
    _cooldowns[key] = datetime.now(timezone.utc) + timedelta(seconds=seconds)


def is_in_cooldown(service: str, anomaly_type: str) -> bool:
    key = f"{service}:{anomaly_type}"
    if key not in _cooldowns:
        return False
    if datetime.now(timezone.utc) >= _cooldowns[key]:
        del _cooldowns[key]
        return False
    return True


def check_dedup(dedup_key: str) -> bool:
    """Returns True if this key was already seen (duplicate)."""
    now = datetime.now(timezone.utc)
    # Clean old entries
    expired = [k for k, v in _dedup.items() if (now - v).total_seconds() > 300]
    for k in expired:
        del _dedup[k]

    if dedup_key in _dedup:
        return True
    _dedup[dedup_key] = now
    return False


def get_all_baselines() -> dict:
    """Return summary of all baselines for debugging."""
    return {k: v.to_dict() for k, v in _baselines.items()}
