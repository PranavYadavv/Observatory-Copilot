import { useState, useEffect } from 'react';
import { Link } from 'react-router';

const NAV_LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Documentation', href: '#documentation' },
  { label: 'Enterprise', href: '#enterprise' },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 lg:px-12"
      style={{
        height: 64,
        background: scrolled ? 'rgba(3, 5, 8, 0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      <a
        href="#"
        className="text-sm tracking-widest"
        style={{
          fontFamily: "'Coda', sans-serif",
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: '#e8e4e1',
          textDecoration: 'none',
        }}
        onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        PARADIGM
      </a>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="nav-link"
            onClick={(e) => handleClick(e, link.href)}
          >
            {link.label}
          </a>
        ))}
        <Link to="/dashboard" className="pill-button" style={{ marginLeft: 8 }}>
          Launch Dashboard
        </Link>
      </div>

      {/* Mobile Hamburger */}
      <button
        className="md:hidden flex flex-col gap-1.5"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span
          className="block w-5 h-px transition-transform"
          style={{
            background: '#e8e4e1',
            transform: menuOpen ? 'rotate(45deg) translateY(3.5px)' : 'none',
          }}
        />
        <span
          className="block w-5 h-px transition-opacity"
          style={{
            background: '#e8e4e1',
            opacity: menuOpen ? 0 : 1,
          }}
        />
        <span
          className="block w-5 h-px transition-transform"
          style={{
            background: '#e8e4e1',
            transform: menuOpen ? 'rotate(-45deg) translateY(-3.5px)' : 'none',
          }}
        />
      </button>

      {/* Mobile Menu */}
      {menuOpen && (
        <div
          className="absolute top-16 left-0 right-0 flex flex-col items-center gap-6 py-8 md:hidden"
          style={{
            background: 'rgba(3, 5, 8, 0.95)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="nav-link"
              onClick={(e) => handleClick(e, link.href)}
            >
              {link.label}
            </a>
          ))}
          <Link to="/dashboard" className="pill-button mt-2">
            Launch Dashboard
          </Link>
        </div>
      )}
    </nav>
  );
}
