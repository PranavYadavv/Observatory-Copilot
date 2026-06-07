export default function ProductOverview() {
  const features = [
    'Sub-second anomaly detection across 50,000+ metrics',
    'Automatic root-cause analysis with confidence scoring',
    'Predictive alerting based on pattern drift, not thresholds',
  ];

  return (
    <section
      id="product"
      style={{
        background: '#030508',
        padding: '120px 24px',
      }}
    >
      <div
        className="mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16"
        style={{ maxWidth: 1200 }}
      >
        {/* Left Column - Text */}
        <div className="w-full lg:w-5/12 reveal-left">
          <p className="label-accent" style={{ marginBottom: 16 }}>
            01 / PRODUCT
          </p>
          <h2 className="heading-section" style={{ marginBottom: 24 }}>
            See the Whole System at Once
          </h2>
          <p className="body-text" style={{ marginBottom: 32 }}>
            Paradigm ingests millions of telemetry events per second across your
            entire stack — Kubernetes clusters, microservices, serverless
            functions, and edge nodes. Our correlation engine maps dependencies
            automatically, building a living topology of your infrastructure that
            updates in real time.
          </p>

          <ul className="flex flex-col gap-4" style={{ marginBottom: 32 }}>
            {features.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-3"
                style={{
                  fontFamily: "'Coda', sans-serif",
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: '#8a817c',
                }}
              >
                <span
                  className="inline-block flex-shrink-0 mt-1.5"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#d4a373',
                  }}
                />
                {f}
              </li>
            ))}
          </ul>

          <a href="#" className="text-link">
            View the Documentation →
          </a>
        </div>

        {/* Right Column - Image */}
        <div className="w-full lg:w-7/12 reveal-scale reveal-delay-2">
          <img
            src="/images/img-product-dashboard.jpg"
            alt="Distributed systems monitoring dashboard showing network topology, time-series charts, and anomaly markers"
            className="w-full"
            style={{
              border: '1px solid rgba(124, 111, 100, 0.2)',
              borderRadius: 8,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
            }}
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
