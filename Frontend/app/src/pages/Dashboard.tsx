import { useState, useEffect, useCallback } from 'react';
import { api, connectIncidentStream } from '../api/client';

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface Incident {
  id: string;
  service_name: string;
  detected_at: string;
  severity: string;
  anomaly_type: string;
  observed_value: number | null;
  baseline_value: number | null;
  z_score: number | null;
  metric_name: string | null;
  root_cause: string;
  contributing_factors: string[];
  remediation_steps: string[];
  confidence_score: number | null;
  llm_model: string;
  llm_fallback_used: boolean;
  resolved_at: string | null;
  user_rating: number | null;
  created_at: string;
}

interface ServiceInfo {
  service_name: string;
  status: string;
  last_seen: string;
  incident_count_24h: number;
  anomaly_count_24h: number;
  metric_count_24h: number;
}

interface Stats {
  total_incidents: number;
  active_incidents: number;
  incidents_last_hour: number;
  total_anomalies: number;
  critical_anomalies: number;
  monitored_services: number;
  avg_confidence_score: number;
}

// ════════════════════════════════════════════════════
// HOOKS
// ════════════════════════════════════════════════════

function usePolling<T>(fetcher: () => Promise<any>, interval: number = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetcher();
      setData(res.data ?? res);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, interval);
    return () => clearInterval(id);
  }, [fetchData, interval]);

  return { data, loading, error, refetch: fetchData };
}

// ════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════

// ── Severity Badge ─────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    WARNING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors[severity] || colors.INFO}`}>
      {severity === 'CRITICAL' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5 animate-pulse" />}
      {severity}
    </span>
  );
}

// ── Status Dot ─────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-emerald-400',
    warning: 'bg-amber-400',
    critical: 'bg-red-400 animate-pulse',
    running: 'bg-emerald-400 animate-pulse',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || 'bg-gray-400'}`} />;
}

// ── Stat Card ──────────────────────────────────────
function StatCard({ label, value, icon, color = 'slate' }: { label: string; value: string | number; icon: string; color?: string }) {
  const colorClasses: Record<string, string> = {
    red: 'from-red-500/10 to-transparent border-red-500/20 text-red-400',
    amber: 'from-amber-500/10 to-transparent border-amber-500/20 text-amber-400',
    emerald: 'from-emerald-500/10 to-transparent border-emerald-500/20 text-emerald-400',
    blue: 'from-blue-500/10 to-transparent border-blue-500/20 text-blue-400',
    violet: 'from-violet-500/10 to-transparent border-violet-500/20 text-violet-400',
    slate: 'from-slate-500/10 to-transparent border-slate-500/20 text-slate-400',
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 ${colorClasses[color]}`}
         style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', borderColor: 'rgba(148, 163, 184, 0.1)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-100">{value}</p>
        </div>
        <span className="text-2xl opacity-60">{icon}</span>
      </div>
    </div>
  );
}

// ── Time Ago ───────────────────────────────────────
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Confidence Bar ─────────────────────────────────
function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-700/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 font-mono">{pct}%</span>
    </div>
  );
}

// ── Star Rating ────────────────────────────────────
function StarRating({ rating, onRate }: { rating: number | null; onRate: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={`text-lg transition-colors ${
            star <= (hover || rating || 0) ? 'text-amber-400' : 'text-slate-600'
          } hover:text-amber-300`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════
// PANELS
// ════════════════════════════════════════════════════

// ── Incident Feed ──────────────────────────────────
function IncidentFeed({ incidents, onSelect }: { incidents: Incident[]; onSelect: (i: Incident) => void }) {
  return (
    <div className="space-y-2">
      {incidents.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">No incidents yet. The simulator will generate anomalies after ~100 seconds of baseline learning.</p>
        </div>
      )}
      {incidents.map((inc) => (
        <button
          key={inc.id}
          onClick={() => onSelect(inc)}
          className="w-full text-left rounded-lg border border-slate-700/50 p-4 hover:border-slate-600 hover:bg-slate-800/50 transition-all duration-200 group"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <SeverityBadge severity={inc.severity} />
                <span className="text-xs font-mono text-slate-500 truncate">{inc.service_name}</span>
                {!inc.resolved_at && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">ACTIVE</span>}
              </div>
              <p className="text-sm text-slate-300 leading-snug line-clamp-2 group-hover:text-slate-200">{inc.root_cause}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span>{inc.metric_name}</span>
                <span>•</span>
                <span>{timeAgo(inc.detected_at)}</span>
                {inc.confidence_score != null && (
                  <>
                    <span>•</span>
                    <span>{Math.round(inc.confidence_score * 100)}% confidence</span>
                  </>
                )}
              </div>
            </div>
            <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Incident Detail ────────────────────────────────
function IncidentDetail({ incident, onBack, onRefresh }: { incident: Incident; onBack: () => void; onRefresh: () => void }) {
  const handleRate = async (rating: number) => {
    try {
      await api.rateIncident(incident.id, rating);
      onRefresh();
    } catch (e) {
      console.error('Rating failed:', e);
    }
  };

  const handleResolve = async () => {
    try {
      await api.resolveIncident(incident.id);
      onRefresh();
    } catch (e) {
      console.error('Resolve failed:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <span className="text-sm font-mono text-slate-400">{incident.service_name}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{new Date(incident.detected_at).toLocaleString()}</p>
        </div>
        {!incident.resolved_at && (
          <button onClick={handleResolve}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
            Resolve
          </button>
        )}
      </div>

      {/* Root Cause */}
      <div className="rounded-xl border border-slate-700/50 p-5" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Root Cause Analysis</h3>
        <p className="text-slate-200 leading-relaxed">{incident.root_cause}</p>
        {incident.confidence_score != null && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-1.5">Confidence</p>
            <ConfidenceBar score={incident.confidence_score} />
          </div>
        )}
      </div>

      {/* Signal Values */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Observed</p>
          <p className="text-lg font-mono text-slate-200 mt-1">{incident.observed_value?.toFixed(2) ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Baseline</p>
          <p className="text-lg font-mono text-slate-200 mt-1">{incident.baseline_value?.toFixed(2) ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Z-Score</p>
          <p className="text-lg font-mono text-red-400 mt-1">{incident.z_score?.toFixed(2) ?? '—'}</p>
        </div>
      </div>

      {/* Contributing Factors */}
      <div className="rounded-xl border border-slate-700/50 p-5" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Contributing Factors</h3>
        <ul className="space-y-2">
          {incident.contributing_factors.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="text-amber-400 mt-0.5">▸</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Remediation Steps */}
      <div className="rounded-xl border border-slate-700/50 p-5" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Remediation Steps</h3>
        <ol className="space-y-2">
          {incident.remediation_steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-semibold border border-blue-500/30">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Rating + Meta */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700/50 p-4" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
        <div>
          <p className="text-xs text-slate-500 mb-1">Rate this analysis</p>
          <StarRating rating={incident.user_rating} onRate={handleRate} />
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <p>Model: <span className="text-slate-400 font-mono">{incident.llm_model}</span></p>
          {incident.llm_fallback_used && <p className="text-amber-400">Template fallback used</p>}
        </div>
      </div>
    </div>
  );
}

// ── Service Cards ──────────────────────────────────
function ServiceCards({ services }: { services: ServiceInfo[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {services.map((svc) => (
        <div key={svc.service_name}
          className="rounded-xl border border-slate-700/50 p-4 hover:border-slate-600 transition-all duration-200"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="flex items-center gap-2 mb-3">
            <StatusDot status={svc.status} />
            <span className="text-sm font-semibold text-slate-200">{svc.service_name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-slate-200">{svc.incident_count_24h}</p>
              <p className="text-[10px] text-slate-500 uppercase">Incidents</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-200">{svc.anomaly_count_24h}</p>
              <p className="text-[10px] text-slate-500 uppercase">Anomalies</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-200">{svc.metric_count_24h}</p>
              <p className="text-[10px] text-slate-500 uppercase">Metrics</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Metrics Sparkline (SVG) ────────────────────────
function Sparkline({ data, color = '#60a5fa' }: { data: { timestamp: string; value: number }[]; color?: string }) {
  if (!data || data.length < 2) return <div className="h-16 flex items-center justify-center text-xs text-slate-600">Collecting data...</div>;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 280;
  const h = 64;
  const padding = 4;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (w - 2 * padding);
    const y = h - padding - ((v - min) / range) * (h - 2 * padding);
    return `${x},${y}`;
  });

  const gradientId = `grad-${Math.random().toString(36).slice(2, 8)}`;
  const areaPoints = `${padding},${h - padding} ${points.join(' ')} ${w - padding},${h - padding}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Metrics Panel ──────────────────────────────────
function MetricsPanel({ selectedService }: { selectedService: string | null }) {
  const [metricsData, setMetricsData] = useState<Record<string, { timestamp: string; value: number }[]>>({});

  useEffect(() => {
    if (!selectedService) return;
    const fetchMetrics = async () => {
      try {
        const res = await api.getMetrics(selectedService);
        setMetricsData(res.data || {});
      } catch (e) {
        console.error('Metrics fetch failed:', e);
      }
    };
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, [selectedService]);

  const metricColors: Record<string, string> = {
    http_request_duration_ms: '#f472b6',
    cpu_usage_percent: '#60a5fa',
    memory_usage_bytes: '#a78bfa',
    throughput_rps: '#34d399',
    http_error_rate_percent: '#fb923c',
    timeout_count: '#f87171',
  };

  if (!selectedService) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        Select a service to view metrics
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(metricsData).map(([name, points]) => (
        <div key={name} className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-slate-400">{name}</span>
            {points.length > 0 && (
              <span className="text-xs font-mono text-slate-300">
                {points[points.length - 1].value.toFixed(1)}
              </span>
            )}
          </div>
          <Sparkline data={points.slice(-60)} color={metricColors[name] || '#60a5fa'} />
        </div>
      ))}
    </div>
  );
}

// ── Anomaly Table ──────────────────────────────────
function AnomalyTable() {
  const fetcher = useCallback(() => api.listAnomalies({ page_size: 30 }), []);
  const { data: anomalies } = usePolling<any[]>(fetcher, 5000);

  return (
    <div className="overflow-auto" style={{ maxHeight: '400px' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
            <th className="py-2 px-3">Time</th>
            <th className="py-2 px-3">Service</th>
            <th className="py-2 px-3">Type</th>
            <th className="py-2 px-3">Severity</th>
            <th className="py-2 px-3">Metric</th>
            <th className="py-2 px-3 text-right">Value</th>
            <th className="py-2 px-3 text-right">Z-Score</th>
          </tr>
        </thead>
        <tbody>
          {anomalies?.map((a: any) => (
            <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
              <td className="py-2 px-3 text-slate-400 font-mono whitespace-nowrap">{timeAgo(a.detected_at)}</td>
              <td className="py-2 px-3 text-slate-300">{a.service_name}</td>
              <td className="py-2 px-3 text-slate-400">{a.anomaly_type}</td>
              <td className="py-2 px-3"><SeverityBadge severity={a.severity} /></td>
              <td className="py-2 px-3 text-slate-400 font-mono">{a.metric_name || '—'}</td>
              <td className="py-2 px-3 text-right text-slate-300 font-mono">{a.observed_value?.toFixed(1) ?? '—'}</td>
              <td className="py-2 px-3 text-right font-mono">
                <span className={a.z_score && Math.abs(a.z_score) >= 3 ? 'text-red-400' : 'text-amber-400'}>
                  {a.z_score?.toFixed(1) ?? '—'}
                </span>
              </td>
            </tr>
          ))}
          {(!anomalies || anomalies.length === 0) && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-slate-500">No anomalies detected yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── System Health ──────────────────────────────────
function SystemHealth() {
  const fetcher = useCallback(() => api.health(), []);
  const { data: health } = usePolling<any>(fetcher, 10000);

  if (!health) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.entries(health.checks || {}).map(([name, check]: [string, any]) => (
        <div key={name} className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={check.status === 'healthy' || check.status === 'running' ? 'healthy' : 'critical'} />
            <span className="text-xs font-semibold text-slate-300 capitalize">{name}</span>
          </div>
          <div className="text-[10px] text-slate-500 space-y-0.5">
            {Object.entries(check).filter(([k]) => k !== 'status').map(([k, v]) => (
              <p key={k}><span className="text-slate-400">{k}:</span> {String(v)}</p>
            ))}
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-slate-700/50 p-3" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
        <div className="flex items-center gap-2 mb-1">
          <StatusDot status="healthy" />
          <span className="text-xs font-semibold text-slate-300">Uptime</span>
        </div>
        <p className="text-lg font-mono text-slate-200">{Math.floor(health.uptime_seconds / 60)}m</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'anomalies' | 'health'>('overview');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);

  // Fetch data
  const statsFetcher = useCallback(() => api.stats(), []);
  const incidentsFetcher = useCallback(() => api.listIncidents({ page_size: 50 }), []);
  const servicesFetcher = useCallback(() => api.listServices(), []);

  const { data: stats } = usePolling<Stats>(statsFetcher, 5000);
  const { data: incidents, refetch: refetchIncidents } = usePolling<Incident[]>(incidentsFetcher, 5000);
  const { data: services } = usePolling<ServiceInfo[]>(servicesFetcher, 10000);

  // Auto-select first service for metrics
  useEffect(() => {
    if (services && services.length > 0 && !selectedService) {
      setSelectedService(services[0].service_name);
    }
  }, [services, selectedService]);

  // WebSocket for real-time incidents
  useEffect(() => {
    const stream = connectIncidentStream(
      (incident) => {
        setLiveIncidents((prev) => [incident, ...prev].slice(0, 5));
        refetchIncidents();
      },
      () => setWsConnected(true),
      () => setWsConnected(false),
    );
    return () => stream.close();
  }, [refetchIncidents]);

  const allIncidents = incidents || [];
  const navItems = [
    { id: 'overview' as const, label: 'Overview', icon: '📊' },
    { id: 'anomalies' as const, label: 'Anomalies', icon: '⚡' },
    { id: 'health' as const, label: 'System Health', icon: '💚' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)', fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top Bar ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80" style={{ background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-slate-200 hover:text-white transition-colors">
              <span className="text-xl">🔭</span>
              <span className="font-bold tracking-tight text-sm">Observability Co-Pilot</span>
            </a>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">v2.0</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Live indicator */}
            {liveIncidents.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-xs text-red-400 font-medium">New incident</span>
              </div>
            )}
            
            {/* WS Status */}
            <div className="flex items-center gap-1.5">
              <StatusDot status={wsConnected ? 'healthy' : 'critical'} />
              <span className="text-[10px] text-slate-500">{wsConnected ? 'Live' : 'Connecting...'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* ── Nav Tabs ──────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSelectedIncident(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-slate-700/80 text-slate-100 shadow-lg'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* ════════════════ OVERVIEW TAB ════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Active Incidents" value={stats?.active_incidents ?? '—'} icon="🚨" color="red" />
              <StatCard label="Total Anomalies" value={stats?.total_anomalies ?? '—'} icon="⚡" color="amber" />
              <StatCard label="Services Monitored" value={stats?.monitored_services ?? '—'} icon="🖥️" color="blue" />
              <StatCard label="Avg Confidence" value={stats?.avg_confidence_score ? `${Math.round(stats.avg_confidence_score * 100)}%` : '—'} icon="🎯" color="emerald" />
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Incident Feed / Detail */}
              <div className="lg:col-span-1 rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
                <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-300">
                    {selectedIncident ? 'Incident Detail' : 'Recent Incidents'}
                  </h2>
                  <span className="text-xs font-mono text-slate-500">{allIncidents.length} total</span>
                </div>
                <div className="p-4 overflow-auto" style={{ maxHeight: '600px' }}>
                  {selectedIncident ? (
                    <IncidentDetail
                      incident={selectedIncident}
                      onBack={() => setSelectedIncident(null)}
                      onRefresh={() => { refetchIncidents(); setSelectedIncident(null); }}
                    />
                  ) : (
                    <IncidentFeed incidents={allIncidents} onSelect={setSelectedIncident} />
                  )}
                </div>
              </div>

              {/* Right column: Services + Metrics */}
              <div className="lg:col-span-2 space-y-6">
                {/* Services */}
                <div className="rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
                  <div className="px-5 py-3 border-b border-slate-700/50">
                    <h2 className="text-sm font-semibold text-slate-300">Services</h2>
                  </div>
                  <div className="p-4">
                    {services ? <ServiceCards services={services} /> : (
                      <div className="text-center py-4 text-slate-500 text-sm">Loading services...</div>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
                  <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-300">Live Metrics</h2>
                    {services && (
                      <div className="flex gap-1.5">
                        {services.map((svc) => (
                          <button
                            key={svc.service_name}
                            onClick={() => setSelectedService(svc.service_name)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                              selectedService === svc.service_name
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            }`}
                          >
                            {svc.service_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <MetricsPanel selectedService={selectedService} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ ANOMALIES TAB ════════════════ */}
        {activeTab === 'anomalies' && (
          <div className="rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="px-5 py-3 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-slate-300">Anomaly Events</h2>
              <p className="text-xs text-slate-500 mt-0.5">All detected anomalies (WARNING + CRITICAL)</p>
            </div>
            <div className="p-4">
              <AnomalyTable />
            </div>
          </div>
        )}

        {/* ════════════════ HEALTH TAB ════════════════ */}
        {activeTab === 'health' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
              <div className="px-5 py-3 border-b border-slate-700/50">
                <h2 className="text-sm font-semibold text-slate-300">System Health</h2>
              </div>
              <div className="p-4">
                <SystemHealth />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
