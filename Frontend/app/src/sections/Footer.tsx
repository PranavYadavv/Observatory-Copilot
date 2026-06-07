const navLinks = ['Product', 'Architecture', 'Documentation', 'Enterprise', 'Pricing', 'Status Page'];
const socialLinks = ['GitHub', 'Twitter', 'LinkedIn', 'Discord'];

export default function Footer() {
  return (
    <footer
      style={{
        background: '#030508',
        borderTop: '1px solid rgba(124, 111, 100, 0.1)',
        padding: '64px 24px 32px',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1200 }}>
        <div className="flex flex-col md:flex-row justify-between gap-12">
          {/* Col 1 - Brand */}
          <div className="md:w-4/12">
            <p
              style={{
                fontFamily: "'Coda', sans-serif",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: '0.12em',
                color: '#e8e4e1',
                marginBottom: 8,
              }}
            >
              PARADIGM
            </p>
            <p
              style={{
                fontFamily: "'Coda', sans-serif",
                fontSize: 14,
                color: '#8a817c',
              }}
            >
              Autonomous infrastructure intelligence
            </p>
          </div>

          {/* Col 2 - Nav Links */}
          <div className="md:w-4/12 flex flex-col gap-3">
            {navLinks.map((link) => (
              <a
                key={link}
                href="#"
                className="nav-link"
                style={{ fontSize: 14 }}
              >
                {link}
              </a>
            ))}
          </div>

          {/* Col 3 - Social Links */}
          <div className="md:w-4/12 flex flex-col gap-3">
            {socialLinks.map((link) => (
              <a
                key={link}
                href="#"
                className="nav-link"
                style={{ fontSize: 14 }}
              >
                {link}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: '1px solid rgba(124, 111, 100, 0.08)',
          }}
        >
          <p
            style={{
              fontFamily: "'Coda', sans-serif",
              fontSize: 12,
              color: '#4a5568',
            }}
          >
            © 2026 Paradigm Systems, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
