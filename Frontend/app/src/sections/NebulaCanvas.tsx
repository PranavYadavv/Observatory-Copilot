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
uniform sampler2D u_noise;
uniform float u_scale;

#define PI 3.14159265359
#define TAU 6.28318530718

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash1(float n) {
  return fract(n * 17.0 * fract(n * 0.1414 + 17.17));
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec3 noised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 du = 30.0 * u * u * (1.0 - u) * (1.0 - u);
  float val = a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  return vec3(val - dot(du, vec2(b - a + (a - b - c + d) * u.y, c - a + (a - b - c + d) * u.x)), du);
}

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    p = rot * p * 2.05 + vec2(1.7, 9.2);
    a *= 0.48;
  }
  return v;
}

vec3 fbmd(vec2 p, int octaves) {
  vec3 v = vec3(0.0);
  float a = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    vec3 n = noised(p);
    v.x += a * n.x;
    v.yz += a * n.yz;
    p = rot * p * 2.05 + vec2(1.7, 9.2);
    a *= 0.48;
  }
  return v;
}

vec3 warpDomain(vec2 p, float t) {
  vec2 q = vec2(
    fbm(p + t * 0.12, 4),
    fbm(p + vec2(5.2, 1.3) + t * 0.09, 4)
  );
  p += 4.0 * q;
  return vec3(fbm(p, 5), q);
}

vec4 warpDomainD(vec2 p, float t) {
  vec3 qt1 = fbmd(p + t * 0.12, 3);
  vec3 qt2 = fbmd(p + vec2(5.2, 1.3) + t * 0.09, 3);
  vec2 q = vec2(qt1.x, qt2.x);
  mat2 dq = mat2(qt1.y, qt2.y, qt1.z, qt2.z);
  p += 4.0 * q;
  vec3 f = fbmd(p, 4);
  vec2 g = vec2(f.y, f.z) + 4.0 * dq * vec2(f.y, f.z);
  return vec4(f.x, g, length(q));
}

float nebulaDensity(vec2 p, float t) {
  vec3 wd = warpDomain(p, t);
  float f2 = fbm(p * 1.5 + vec2(3.1, 7.4) + t * 0.06, 4);
  float f3 = fbm(p * 0.7 + vec2(13.0, 2.6) + t * 0.04, 3);
  float f4 = vnoise(p * 0.3 + t * 0.03);
  return smoothstep(-0.2, 0.6, wd.x * 0.5 + f2 * 0.3 + f3 * 0.2) * 0.6 + f4 * 0.15;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - u_res * 0.5) / min(u_res.x, u_res.y);
  float aspect = u_res.x / u_res.y;
  float t = u_time * 0.5;
  float scale = u_scale;

  vec2 p = uv * scale;
  p += vec2(cos(t * 0.023) * 0.15, sin(t * 0.017) * 0.12);

  vec4 n1 = warpDomainD(p, t);
  float d1 = n1.x;
  vec2 g1 = n1.yz;
  float wd1 = n1.w;

  float d2 = fbm(p * 1.5 + vec2(3.1, 7.4) + t * 0.06, 4);
  float density = nebulaDensity(p, t);

  float g1a = length(g1);
  float g1d = atan(g1.y, g1.x);

  float f = d1 * 0.5 + d2 * 0.3 + smoothstep(0.1, 0.5, density) * 0.3;
  float ff = smoothstep(-0.3, 0.5, f);

  float w1 = smoothstep(0.0, 0.15, ff);
  float w2 = smoothstep(0.15, 0.4, ff);
  float w3 = smoothstep(0.4, 0.7, ff);
  float w4 = smoothstep(0.7, 1.0, ff);

  vec3 u_color1 = vec3(0.039, 0.086, 0.157);
  vec3 u_color2 = vec3(0.290, 0.333, 0.408);
  vec3 u_color3 = vec3(0.486, 0.435, 0.392);
  vec3 u_color4 = vec3(0.831, 0.639, 0.451);

  vec3 col = mix(u_color1, u_color2, w1);
  col = mix(col, u_color3, w2 * (1.0 - w4 * 0.3));
  col = mix(col, u_color4, w3);

  col += u_color4 * exp(-abs(g1a) * 6.0) * 0.18 * w2;

  float highlight = smoothstep(0.3, 0.6, d1) * (1.0 - smoothstep(0.6, 0.8, d1));
  col += mix(u_color3, u_color4, smoothstep(0.3, 0.7, w2 + w3 * 0.5)) * highlight * 0.3;

  float core = exp(-max(ff - 0.5, 0.0) * 8.0) * 0.4 * w3;
  col += vec3(1.0, 0.97, 0.92) * core;

  float texN = texture2D(u_noise, fragCoord * 0.00781).x;
  col += vec3(0.5) * ((texN - 0.5) * 0.08) * (w2 + w3);

  col *= 0.85 + 0.15 * sin(g1d * 5.0 + t * 0.2);

  float vig = 1.0 - dot(uv * vec2(0.85, 1.0), uv * vec2(0.85, 1.0)) * 0.6;
  col *= max(vig, 0.0);

  col = col * col * (3.0 - 2.0 * col);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
  }
  return s;
}

export default function NebulaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) return;

    // Check highp support
    const highp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const fragSrc = (!highp || highp.precision === 0)
      ? FRAG.replace('precision highp float', 'precision mediump float')
      : FRAG;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
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
    const uScale = gl.getUniformLocation(prog, 'u_scale');
    const uNoise = gl.getUniformLocation(prog, 'u_noise');

    // Generate noise texture
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const noiseData = new Uint8Array(128 * 128 * 4).map(() => Math.random() * 256);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(uNoise, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    }

    gl.uniform1f(uScale, 2.0);
    resize();
    window.addEventListener('resize', resize);

    let rafId: number;
    function render(now: number) {
      gl!.uniform1f(uTime, now * 0.001);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
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
        zIndex: 0,
      }}
    />
  );
}
