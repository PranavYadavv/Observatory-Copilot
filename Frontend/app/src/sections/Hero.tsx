import { Link } from 'react-router';
import NebulaCanvas from './NebulaCanvas';
import Starfield from './Starfield';

export default function Hero() {
  const handleExploreClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.querySelector('#product');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="hero"
      role="banner"
      className="relative w-full overflow-hidden"
      style={{ height: '100vh' }}
    >
      <NebulaCanvas />
      <Starfield />

      {/* Content */}
      <div
        className="relative flex flex-col items-center text-center px-6"
        style={{
          zIndex: 2,
          position: 'absolute',
          bottom: '16vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 900,
        }}
      >
        <p className="label-accent" style={{ marginBottom: 24 }}>
          AI-POWERED INFRASTRUCTURE INTELLIGENCE
        </p>

        <h1
          className="heading-display"
          style={{
            color: '#e8e4e1',
            textShadow: '0 0 80px rgba(3, 5, 8, 0.9), 0 2px 20px rgba(3, 5, 8, 0.7), 0 0 40px rgba(10, 22, 40, 0.8)',
          }}
        >
          The Next Paradigm in
          <br />
          Systems{' '}
          <span className="shimmer">Observability</span>
        </h1>

        <p
          className="body-text"
          style={{
            maxWidth: 560,
            marginTop: 24,
            fontSize: 18,
            color: '#b0a89f',
            textShadow: '0 1px 12px rgba(3, 5, 8, 0.8), 0 0 4px rgba(3, 5, 8, 0.6)',
          }}
        >
          An autonomous telemetry engine that correlates logs, traces, and metrics
          across distributed systems — surfacing root causes before they become
          incidents.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4" style={{ marginTop: 40 }}>
          <a
            href="#product"
            className="pill-button-amber"
            onClick={handleExploreClick}
          >
            Explore the Architecture
          </a>
          <Link
            to="/dashboard"
            className="pill-button"
          >
            Launch Dashboard →
          </Link>
        </div>
      </div>

      {/* Bottom scroll indicator */}
      <div
        className="scroll-indicator absolute left-0 right-0 flex flex-col items-center gap-2"
        style={{
          bottom: 32,
          zIndex: 2,
        }}
      >
        <span
          className="text-xs tracking-widest"
          style={{
            fontFamily: "'Coda', sans-serif",
            color: 'rgba(124, 111, 100, 0.5)',
            letterSpacing: '0.12em',
          }}
        >
          Scroll
        </span>
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          style={{ opacity: 0.5 }}
        >
          <path
            d="M1 1L6 6L11 1"
            stroke="#7c6f64"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Bottom line */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: 1,
          background: 'rgba(124, 111, 100, 0.3)',
          zIndex: 2,
        }}
      />
    </section>
  );
}
