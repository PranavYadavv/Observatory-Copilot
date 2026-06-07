import { useState } from 'react';

const logos = [
  { src: '/images/img-logo-1.jpg', name: 'Vertex' },
  { src: '/images/img-logo-2.jpg', name: 'Signal' },
  { src: '/images/img-logo-3.jpg', name: 'Lattice' },
  { src: '/images/img-logo-4.jpg', name: 'Orbit' },
  { src: '/images/img-logo-5.jpg', name: 'Pulse' },
];

export default function Enterprise() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <section
      id="enterprise"
      style={{
        background: '#080c14',
        borderTop: '1px solid rgba(124, 111, 100, 0.1)',
        padding: '120px 24px',
      }}
    >
      <div className="mx-auto text-center reveal" style={{ maxWidth: 1200 }}>
        <p className="label-accent" style={{ marginBottom: 16 }}>
          04 / ENTERPRISE
        </p>
        <h2 className="heading-section" style={{ marginBottom: 16 }}>
          Trusted by Teams Running Mission-Critical Infrastructure
        </h2>
        <p
          className="body-text mx-auto"
          style={{ maxWidth: 600, marginBottom: 64 }}
        >
          SOC 2 Type II certified. GDPR compliant. Deploy in your VPC, our
          cloud, or hybrid.
        </p>

        {/* Logo Row */}
        <div
          className="flex flex-wrap justify-center md:justify-between items-center gap-8"
          style={{ marginBottom: 64 }}
        >
          {logos.map((logo, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                width: 120,
                height: 80,
                opacity: hoveredIdx === i ? 1 : 0.5,
                transition: 'opacity 0.3s ease',
                cursor: 'pointer',
                filter: hoveredIdx === i ? 'none' : 'grayscale(0.3)',
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <img
                src={logo.src}
                alt={`${logo.name} logo`}
                className="max-w-full max-h-full object-contain"
                style={{
                  filter:
                    hoveredIdx === i
                      ? 'brightness(1.2)'
                      : 'brightness(0.7)',
                  transition: 'filter 0.3s ease',
                }}
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {/* Testimonial Card */}
        <div
          className="reveal reveal-delay-2 mx-auto"
          style={{
            maxWidth: 640,
            background: 'rgba(10, 14, 24, 0.6)',
            border: '1px solid rgba(124, 111, 100, 0.15)',
            borderRadius: 12,
            padding: 48,
            backdropFilter: 'blur(8px)',
          }}
        >
          <p
            style={{
              fontFamily: "'Coda', sans-serif",
              fontSize: 18,
              fontStyle: 'italic',
              lineHeight: 1.6,
              color: '#e8e4e1',
              marginBottom: 24,
            }}
          >
            "Paradigm reduced our mean-time-to-resolution by 73% in the first
            quarter. The AI correlation engine found a cascading failure pattern
            we'd been missing for months."
          </p>
          <p
            style={{
              fontFamily: "'Coda', sans-serif",
              fontSize: 14,
              color: '#7c6f64',
            }}
          >
            — Engineering Lead, Distributed Systems Team
          </p>
        </div>
      </div>
    </section>
  );
}
