import CrtGridCanvas from './CrtGridCanvas';

const cards = [
  {
    color: '#d4a373',
    title: 'Ingestion Layer',
    body: 'Kafka-backed stream processors with automatic partitioning and backpressure handling.',
  },
  {
    color: '#7c6f64',
    title: 'Inference Tier',
    body: 'Edge-deployed detection models with sub-100ms p95 latency on commodity hardware.',
  },
  {
    color: '#d4a373',
    title: 'Correlation Engine',
    body: 'Graph-based dependency mapping with automatic service discovery and health scoring.',
  },
];

export default function Architecture() {
  return (
    <section
      id="architecture"
      className="relative overflow-hidden"
      style={{
        background: '#080c14',
        padding: '160px 24px',
      }}
    >
      <CrtGridCanvas />

      <div className="relative mx-auto" style={{ zIndex: 1, maxWidth: 1000 }}>
        <div className="text-center reveal">
          <p className="label-accent" style={{ marginBottom: 16 }}>
            02 / ARCHITECTURE
          </p>
          <h2 className="heading-section" style={{ marginBottom: 24 }}>
            Built for Scale, Engineered for Precision
          </h2>
          <p
            className="body-text mx-auto"
            style={{ maxWidth: 720, marginBottom: 64 }}
          >
            Three processing tiers work in concert. The ingestion layer handles
            2M+ events per second via distributed stream processing. The
            inference tier runs lightweight anomaly detection models at the edge,
            feeding a central correlation engine that assembles cross-system
            narratives. A specialized LLM layer translates raw signal patterns
            into human-readable incident reports — ranked by business impact and
            confidence.
          </p>
        </div>

        {/* Architecture Cards */}
        <div className="flex flex-col md:flex-row justify-center gap-8">
          {cards.map((card, i) => (
            <div
              key={i}
              className={`reveal reveal-delay-${i + 1}`}
              style={{
                width: 280,
                background: 'rgba(10, 14, 24, 0.7)',
                border: '1px solid rgba(124, 111, 100, 0.15)',
                borderRadius: 12,
                padding: '40px 32px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span
                className="pulse-dot inline-block"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: card.color,
                  marginBottom: 20,
                }}
              />
              <h3
                style={{
                  fontFamily: "'Neuton', serif",
                  fontSize: 22,
                  fontWeight: 400,
                  color: '#e8e4e1',
                  marginBottom: 12,
                }}
              >
                {card.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Coda', sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#8a817c',
                }}
              >
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
