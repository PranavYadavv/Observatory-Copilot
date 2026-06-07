import { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  pulse: number;
  pulseSpeed: number;
}

const PALETTE = ['#7c6f64', '#d4a373', '#e8e4e1', '#4a5568'];

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const PARTICLE_COUNT = 1200;

    let canvasWidth = window.innerWidth;
    let canvasHeight = window.innerHeight;

    function updateSize() {
      canvasWidth = window.innerWidth;
      canvasHeight = window.innerHeight;
      canvas!.width = canvasWidth * dpr;
      canvas!.height = canvasHeight * dpr;
    }

    updateSize();

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        vx: (Math.random() - 0.5) * 0.05,
        vy: (Math.random() - 0.5) * 0.05,
        size: Math.random() * 1.8 + 0.2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        alpha: Math.random() * 0.6 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
      });
    }

    window.addEventListener('resize', updateSize);

    let rafId: number;
    function draw() {
      ctx!.clearRect(0, 0, canvasWidth, canvasHeight);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        const flicker = 0.85 + Math.sin(p.pulse) * 0.15;
        const alpha = p.alpha * flicker;

        // Wrap
        if (p.x < -10) p.x = canvasWidth + 10;
        if (p.x > canvasWidth + 10) p.x = -10;
        if (p.y < -10) p.y = canvasHeight + 10;
        if (p.y > canvasHeight + 10) p.y = -10;

        const { r, g, b } = hexToRgb(p.color);

        ctx!.globalCompositeOperation = 'lighter';

        // Glow
        const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx!.fill();

        // Core dot
        ctx!.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx!.fill();

        // Extra glow for large stars
        if (p.size > 1.5) {
          const glowGrad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
          glowGrad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.2})`);
          glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx!.fillStyle = glowGrad;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      ctx!.globalCompositeOperation = 'source-over';
      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}
