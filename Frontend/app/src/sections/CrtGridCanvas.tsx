import { useRef, useEffect } from 'react';

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform float u_time;
uniform vec2 u_res;
uniform float u_lineDensity;
uniform float u_pulseSpeed;
uniform float u_colorShift;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

float gridLine(float coord, float density) {
  float grid = abs(fract(coord * density - 0.5) - 0.5);
  float lw = 0.04 / density;
  return smoothstep(lw, 0.0, grid);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float t = u_time;

  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);

  vec3 gridCol = vec3(0.486, 0.435, 0.392);

  // Breathing pulse
  float breathe = sin(t * u_pulseSpeed) * 0.5 + 0.5;
  float expansion = 1.0 + breathe * 0.15;
  float pulseRing = smoothstep(0.05, 0.0, abs(r - expansion * 0.3));
  pulseRing += smoothstep(0.03, 0.0, abs(r - expansion * 0.6)) * 0.5;
  gridCol += breathe * 0.08;
  gridCol += vec3(0.831, 0.639, 0.451) * pulseRing * 0.6;

  // Horizontal lines (perspective)
  vec2 perspUV = p / (r + 0.15);
  float hLines = gridLine(perspUV.y, u_lineDensity * 3.0);
  float hFade = smoothstep(0.0, 0.4, 1.0 - r) * smoothstep(1.0, 0.2, r);
  hLines += gridLine(p.y, u_lineDensity * 1.5) * hFade * 0.3;
  float hGrid = hLines * hFade;

  // Vertical lines (radial)
  float vLines = gridLine(a / 6.28318530718, u_lineDensity);
  float vFade = smoothstep(0.05, 0.25, r) * smoothstep(1.0, 0.3, r);
  float vGrid = vLines * vFade;

  // Scanline
  float scanY = fract(t * u_pulseSpeed * 0.3);
  float scanDist = abs(p.y - (scanY * 2.0 - 1.0) * 0.7);
  float scanLine = smoothstep(0.02, 0.0, scanDist);
  gridCol += vec3(0.290, 0.333, 0.408) * scanLine * 0.15;

  // Combine
  float grid = max(hGrid, vGrid * 0.7);

  // Color phase shift
  float phase = t * u_colorShift;
  float sinPhase = sin(phase) * 0.5 + 0.5;
  vec3 color = mix(gridCol, vec3(0.290, 0.333, 0.408), sinPhase * 0.2);

  vec3 finalColor = color * grid;

  // Sparkles
  if (grid > 0.1) {
    float sparkle = hash(gl_FragCoord.x * 0.05 + gl_FragCoord.y * 73.0 + t * 0.5);
    sparkle = smoothstep(0.995, 1.0, sparkle) * (sin(t * 10.0 + gl_FragCoord.x) * 0.5 + 0.5);
    finalColor += vec3(0.831, 0.639, 0.451) * sparkle * grid;
  }

  // Center glow
  float centerGlow = exp(-r * r * 8.0) * (sin(t * u_pulseSpeed * 2.0) * 0.3 + 0.7);
  finalColor += vec3(0.486, 0.435, 0.392) * centerGlow * 0.06;

  // Vignette
  float vig = 1.0 - smoothstep(0.3, 1.1, r);
  finalColor *= 0.7 + 0.3 * vig;

  gl_FragColor = vec4(finalColor * 0.25, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('CRT shader compile error:', gl.getShaderInfoLog(s));
  }
  return s;
}

export default function CrtGridCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uLineDensity = gl.getUniformLocation(prog, 'u_lineDensity');
    const uPulseSpeed = gl.getUniformLocation(prog, 'u_pulseSpeed');
    const uColorShift = gl.getUniformLocation(prog, 'u_colorShift');

    gl.uniform1f(uLineDensity, 16.0);
    gl.uniform1f(uPulseSpeed, 0.8);
    gl.uniform1f(uColorShift, 0.15);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    function resize() {
      const w = container!.offsetWidth;
      const h = container!.offsetHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    }

    resize();

    let isVisible = true;
    let rafId: number;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(container);

    function render(now: number) {
      if (isVisible) {
        gl!.uniform1f(uTime, now * 0.001);
        gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      }
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
