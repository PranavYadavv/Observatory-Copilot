<p align="center">
  <img src="Frontend/final-hero.png" alt="Observability Co-Pilot" width="100%" />
</p>

<h1 align="center">🔭 Observability Co-Pilot</h1>

<p align="center">
  <strong>AI-powered root cause analysis for distributed systems</strong>
</p>

<p align="center">
  An autonomous telemetry engine that correlates logs, traces, and metrics across microservices — surfacing root causes before they become outages.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-blue?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/WebSocket-Live-brightgreen?style=flat-square" alt="WebSocket" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

---

## ✨ What It Does

Observability Co-Pilot is a **full-stack observability platform** that monitors microservices in real time, automatically detects anomalies, and generates AI-driven root cause analyses — all pushed to your dashboard within seconds.

### The Pipeline

```
Telemetry Data → Anomaly Detection → Root Cause Analysis → Real-Time Dashboard
  (logs, traces,    (Z-score + IQR)    (Template/LLM)     (WebSocket push)
   metrics)
```

**Key capabilities:**

- 🔍 **Dual Detection Algorithms** — Z-score (Welford's online algorithm) for continuous metrics, IQR fencing for error rates
- 🧠 **Automated RCA** — Template-based root cause analysis with LLM-ready architecture
- ⚡ **Real-Time Streaming** — WebSocket-powered incident feed with sub-second latency
- 📊 **Live Metrics Dashboard** — SVG sparkline charts with 5-second polling across all services
- 🛡️ **Alert Storm Prevention** — Deduplication, cooldown windows, and suppression logic
- ⭐ **Feedback Loop** — Rate RCA quality (1–5 stars) to improve future analyses

---

## 🖥️ Screenshots

<p align="center">
  <img src="Frontend/screenshot.png" alt="Dashboard" width="100%" />
</p>

<p align="center">
  <em>Real-time operational dashboard with incident feed, service health, and live metric sparklines</em>
</p>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  Landing Page  ·  Dashboard  ·  Anomaly Table  ·  Health View   │
│            Vite + TypeScript + Tailwind + Recharts              │
└──────────────────────────┬──────────────────────────────────────┘
                           │  REST API + WebSocket
┌──────────────────────────┴──────────────────────────────────────┐
│                     Backend (FastAPI)                            │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Simulator   │  │  Detection   │  │  Correlation / RCA     │  │
│  │  5 services  │→ │  Z-score     │→ │  Template engine       │  │
│  │  3 metrics   │  │  IQR fence   │  │  (LLM-ready)           │  │
│  │  per service │  │  per metric  │  │                        │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Welford's Online Algorithm (O(1) time, O(1) memory)     │   │
│  │  Running mean + variance · Cooldown · Dedup store        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│                       SQLite (local) / PostgreSQL (prod)        │
└─────────────────────────────────────────────────────────────────┘
```

### Simulated Services

| Service | Metrics Tracked |
|---------|----------------|
| `api-gateway` | `http_request_duration_ms`, `throughput_rps`, `http_error_rate_percent` |
| `user-service` | `http_request_duration_ms`, `cpu_usage_percent`, `memory_usage_bytes` |
| `order-service` | `http_request_duration_ms`, `throughput_rps`, `cpu_usage_percent` |
| `payment-service` | `http_request_duration_ms`, `http_error_rate_percent`, `timeout_count` |
| `inventory-service` | `cpu_usage_percent`, `memory_usage_bytes`, `throughput_rps` |

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.11+
- **Node.js** 18+
- **npm** or **pnpm**

### 1. Clone the repo

```bash
git clone https://github.com/PranavYadavv/Observatory-Copilot.git
cd Observatory-Copilot
```

### 2. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API server starts on `http://localhost:8000`. The built-in telemetry simulator begins generating data immediately — anomalies are injected every ~30 seconds after a 100-second baseline warmup.

### 3. Start the Frontend

```bash
cd Frontend/app
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` by default.

### 4. Environment Variables

Copy the example env file and configure:

```bash
cp .env.example Frontend/app/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `http://localhost:8000/api/v1` | Backend API base URL |
| `VITE_API_KEY` | `demo-key-2026` | API key for authentication |

---

## 📡 API Reference

All endpoints are prefixed with `/api/v1` and require an `X-API-Key` header.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/incidents` | List incidents (filterable by service, severity, time range) |
| `GET` | `/incidents/:id` | Get incident detail with full RCA |
| `PATCH` | `/incidents/:id/rating` | Rate RCA quality (1–5) |
| `PATCH` | `/incidents/:id/resolve` | Mark incident as resolved |
| `GET` | `/anomalies` | List anomaly events (WARNING + CRITICAL) |
| `GET` | `/metrics/:service` | Get time-series metrics for a service |
| `GET` | `/services` | List monitored services with health status |
| `GET` | `/stats` | Dashboard statistics and baseline data |
| `GET` | `/health` | System health check |

### Alert Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/alerts/config` | List all alert configurations |
| `POST` | `/alerts/config` | Create/update per-service alert thresholds |

### Dead Letter Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dlq` | List unreviewed DLQ events |
| `PATCH` | `/dlq/:id/review` | Mark DLQ event as reviewed |

### WebSocket

```
ws://localhost:8000/ws/incidents?api_key=demo-key-2026
```

Receives real-time incident payloads as they are created. Supports ping/pong keepalive.

---

## 🔬 Detection Engine

### Z-Score Detection (Continuous Metrics)

Uses **Welford's online algorithm** for O(1) incremental mean and variance calculation:

```python
# Welford's recurrence relation
n += 1
delta = value - mean
mean += delta / n
delta2 = value - mean
M2 += delta * delta2
```

- **Cold start protection**: Suppresses alerts for the first 100 data points
- **Configurable thresholds**: Default WARNING at z ≥ 2.0, CRITICAL at z ≥ 3.0
- **Direction sensitivity**: Upper-only, lower-only, or both

### IQR Detection (Error Rates)

For bursty metrics like `http_error_rate_percent` and `timeout_count`:

- 60-sample sliding window
- Upper fence: Q3 + 1.5 × IQR → WARNING
- Extreme fence: Q3 + 3.0 × IQR → CRITICAL

### Alert Storm Prevention

- **Deduplication**: MD5 hash of `service:metric:5min-bucket` — same signal ≤ 1 alert per window
- **Cooldown**: Per-service, per-anomaly-type lockout (default 5 min)
- **Suppression tracking**: Suppressed anomalies are still recorded for audit

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async REST API + WebSocket server |
| **Pydantic** | Request/response validation |
| **SQLite / aiosqlite** | Local data store (PostgreSQL in production) |
| **bcrypt** | API key hashing |
| **structlog** | Structured logging |
| **uvicorn** | ASGI server |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Vite 7** | Build toolchain |
| **Tailwind CSS** | Styling |
| **Recharts** | Charting library |
| **GSAP** | Animations (landing page) |
| **Three.js** | 3D nebula canvas (landing page) |
| **Radix UI** | Accessible component primitives |
| **React Router** | Client-side routing |

### Production Schema (designed for)
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Incidents, configs, auth (ACID) |
| **ClickHouse** | Time-series telemetry (columnar, 24h TTL) |
| **Redis** | Baseline store, cooldowns, dedup (TTL-based) |
| **Kafka** | Event streaming (logs, traces, metrics, DLQ) |

---

## 📁 Project Structure

```
Observatory-Copilot/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, REST endpoints, WebSocket
│   │   ├── models.py         # Pydantic models (TRD-aligned)
│   │   ├── simulator.py      # Telemetry simulator (5 services)
│   │   ├── detection.py      # Anomaly detection (Z-score + IQR)
│   │   ├── correlation.py    # RCA engine (template + LLM-ready)
│   │   ├── welford.py        # Welford's algorithm + cooldown/dedup
│   │   └── database.py       # SQLite async database layer
│   ├── observability-copilot-schema.sql  # Full production schema
│   └── requirements.txt
├── Frontend/
│   ├── app/
│   │   ├── src/
│   │   │   ├── App.tsx        # Routes (Landing + Dashboard)
│   │   │   ├── pages/
│   │   │   │   └── Dashboard.tsx  # Real-time ops dashboard
│   │   │   ├── sections/      # Landing page sections
│   │   │   │   ├── Hero.tsx
│   │   │   │   ├── NebulaCanvas.tsx
│   │   │   │   ├── Architecture.tsx
│   │   │   │   └── ...
│   │   │   ├── api/           # API client
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   └── components/    # Reusable UI components
│   │   ├── package.json
│   │   └── tailwind.config.js
│   ├── screenshot.png
│   └── final-hero.png
├── documentation/
│   ├── Observability-CoPilot-Overview.pdf
│   ├── observability-copilot-prd.docx
│   ├── observability-copilot-trd-v2.docx
│   └── observability-copilot-appflow.pdf
├── .env.example
└── README.md
```

---

## 📄 Documentation

Detailed design documents are available in the [`documentation/`](documentation/) directory:

| Document | Contents |
|----------|----------|
| **PRD** | Product Requirements — user stories, acceptance criteria |
| **TRD v2** | Technical Requirements — API contracts, detection algorithms, data schemas |
| **App Flow** | End-to-end application flow diagrams |
| **Overview** | High-level system overview and architecture |

---

## 🗺️ Roadmap

- [ ] **LLM Integration** — Plug in Claude / GPT for real RCA generation (architecture is ready)
- [ ] **Kubernetes Deployment** — Helm chart with PostgreSQL, ClickHouse, Redis, Kafka
- [ ] **JWT Authentication** — Phase 2 auth upgrade (middleware is designed for both API key + JWT)
- [ ] **Alerting Integrations** — Slack, PagerDuty, email notifications
- [ ] **Custom Dashboards** — User-configurable metric panels and layouts
- [ ] **Historical Analysis** — Trend comparison and incident replay

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ☕ and curiosity
</p>
