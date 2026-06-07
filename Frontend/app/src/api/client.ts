/**
 * API Client for the Observability Co-Pilot backend.
 * Wraps all REST endpoints from TRD §4.1.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API error: ${res.status}`);
  }

  return res.json();
}

// ── API Methods ──────────────────────────────────

export const api = {
  // Health
  health: () => request<any>('/health'),

  // Stats
  stats: () => request<any>('/stats'),

  // Incidents
  listIncidents: (params?: {
    service?: string;
    severity?: string;
    page?: number;
    page_size?: number;
  }) => request<any>('/incidents', { params }),

  getIncident: (id: string) => request<any>(`/incidents/${id}`),

  rateIncident: (id: string, rating: number) =>
    request<any>(`/incidents/${id}/rating`, {
      method: 'PATCH',
      body: { rating },
    }),

  resolveIncident: (id: string) =>
    request<any>(`/incidents/${id}/resolve`, { method: 'PATCH' }),

  // Anomalies
  listAnomalies: (params?: {
    service?: string;
    severity?: string;
    suppressed?: boolean;
    page?: number;
    page_size?: number;
  }) => request<any>('/anomalies', { params }),

  // Metrics
  getMetrics: (service: string, params?: {
    metric?: string;
    from?: string;
    to?: string;
    granularity?: string;
  }) => request<any>(`/metrics/${service}`, { params }),

  // Services
  listServices: () => request<any>('/services'),

  // Alert Config
  listAlertConfigs: () => request<any>('/alerts/config'),

  upsertAlertConfig: (config: any) =>
    request<any>('/alerts/config', { method: 'POST', body: config }),

  // DLQ
  listDLQ: (params?: { source_topic?: string }) =>
    request<any>('/dlq', { params }),

  reviewDLQ: (id: string) =>
    request<any>(`/dlq/${id}/review`, { method: 'PATCH' }),

  // Baselines
  getBaselines: () => request<any>('/baselines'),
};

// ── WebSocket ────────────────────────────────────

export function connectIncidentStream(
  onIncident: (incident: any) => void,
  onConnect?: () => void,
  onDisconnect?: () => void,
): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    ws = new WebSocket('ws://localhost:8000/ws/incidents');

    ws.onopen = () => {
      console.log('[WS] Connected to incident stream');
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'incident') {
          onIncident(msg.payload);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected — reconnecting in 3s');
      onDisconnect?.();
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return {
    close: () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
