"use client";

import { useEffect, useRef, useState } from "react";

/* A backlit comb wall. Cells hold honey at their own fill levels and the
   pointer is a lamp moving behind the wax, so light pools and bleeds through
   the thin walls. Cells build outward from the centre on load, the way bees
   actually draw comb. */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uLight;   // lamp position, aspect-corrected units
uniform float uBuild;   // 0 -> 1 comb construction
uniform float uFade;    // 0 -> 1 scroll-out
uniform float uScale;   // cells across the height, set to hold cell size fixed

const vec3 WAX_DARK   = vec3(0.071, 0.047, 0.016);
const vec3 WALL_LIT   = vec3(0.404, 0.259, 0.082);
const vec3 HONEY_DEEP = vec3(0.612, 0.310, 0.008);
const vec3 NECTAR     = vec3(1.000, 0.741, 0.180);
const vec3 FLARE      = vec3(1.000, 0.898, 0.639);

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

/* xy = position inside the cell, zw = cell id */
vec4 hexCell(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 0.8660254)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy)
                                           : vec4(h.zw, hC.zw + 0.5);
}

/* 0 at the centre of a cell, 0.5 at its wall */
float hexEdge(vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.5, 0.8660254)), p.x);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  /* Cells stay a constant size on screen, so a phone shows fewer of them
     rather than enormous ones. */
  float scale = uScale;
  vec2 p = uv * scale;
  /* A slow drift keeps the wall alive when nothing is pointing at it. */
  p += vec2(sin(uTime * 0.06) * 0.18, cos(uTime * 0.05) * 0.13);

  vec4 hc = hexCell(p);
  vec2 id = hc.zw;
  float d = hexEdge(hc.xy);
  vec2 rnd = hash2(id);

  /* Comb is drawn from the middle outward, each cell with its own hesitation. */
  float ring = length(id * vec2(1.0, 0.9));
  /* The wave has to cross however many cells this viewport holds. */
  float appear = clamp(uBuild * scale * 1.5 - ring - rnd.x * 2.2, 0.0, 1.0);
  appear = appear * appear * (3.0 - 2.0 * appear);

  /* One tight pool of light behind the wall, plus a far weaker wanderer.
     Most of the comb stays in shadow so the headline keeps the foreground. */
  vec2 ambient = vec2(cos(uTime * 0.17) * 3.4, sin(uTime * 0.23) * 1.9);
  float dLamp = length(p - uLight * scale);
  float dAmb  = length(p - ambient);
  float light = 3.2 / (1.0 + dLamp * dLamp * 0.2)
              + 0.8 / (1.0 + dAmb * dAmb * 0.13);
  light *= appear;

  /* Wax wall, its inner crest, and the open interior of the cell. */
  float wallW = 0.088;
  float wall = smoothstep(0.5 - wallW - 0.016, 0.5 - wallW, d);
  float interior = 1.0 - wall;
  float crest = smoothstep(0.03, 0.0, abs(d - (0.5 - wallW)));

  /* The wall is a bevel, not a flat band: its faces turn toward a key light
     from the upper left, which is what gives the comb its relief. */
  vec2 nrm = normalize(hc.xy + vec2(1e-4));
  float bevel = dot(nrm, normalize(vec2(-0.55, 0.83))) * 0.5 + 0.5;

  /* Cells are hollows — deeper toward the middle, so they fall into shadow. */
  float depth = smoothstep(0.5 - wallW, 0.04, d);

  /* Honey settles to the bottom of each cell and trembles a little. */
  float level = -0.40 + (0.18 + rnd.y * 0.46) * appear
              + sin(uTime * 0.7 + rnd.x * 6.283) * 0.01;
  float honeyMask = smoothstep(level + 0.05, level - 0.05, hc.y) * interior;

  /* Caustics: light bent by the curved meniscus inside the cell. */
  float caustic = sin(hc.x * 16.0 + uTime * 0.9 + rnd.x * 6.283)
                * sin(hc.y * 13.0 - uTime * 0.7 + rnd.y * 6.283);
  caustic = caustic * 0.5 + 0.5;

  /* Empty cells read as shadowed hollows. */
  vec3 col = WAX_DARK * (0.30 + light * 0.16) * (1.0 - depth * 0.62);

  /* Wax takes the key light across its bevel and a little warmth per cell. */
  vec3 waxCol = mix(vec3(0.075, 0.048, 0.016), WALL_LIT, bevel * 0.85 + 0.15);
  waxCol *= 0.42 + clamp(light, 0.0, 2.4) * 0.5;
  waxCol *= 0.88 + rnd.x * 0.24;
  col = mix(col, waxCol, wall * appear);

  vec3 honey = mix(HONEY_DEEP, NECTAR, clamp(light * 0.36 + caustic * 0.26, 0.0, 1.0));
  honey = mix(honey, FLARE, smoothstep(2.4, 4.6, light) * caustic * 0.4);
  honey *= 0.34 + clamp(light, 0.0, 2.2) * 0.42;
  honey *= 1.0 - depth * 0.3;
  col = mix(col, honey, honeyMask * (0.6 + 0.4 * appear));

  /* The crest of each wall takes a specular highlight. */
  col += FLARE * crest * appear * bevel * (0.02 + light * 0.06);

  /* Thin wax transmits a little of the lamp everywhere. */
  col += NECTAR * light * 0.016 * appear;

  /* A bright meniscus line where honey meets air. */
  float meniscus = smoothstep(0.014, 0.0, abs(hc.y - level)) * interior * appear;
  col += FLARE * meniscus * (0.05 + light * 0.11);

  float vignette = smoothstep(1.7, 0.15, length(uv * vec2(0.68, 1.0)));
  col *= 0.16 + vignette * 0.84;

  /* Film grain keeps the gradients from banding on wide screens. */
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.018;

  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroComb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl =
      canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uBuild = gl.getUniformLocation(program, "uBuild");
    const uFade = gl.getUniformLocation(program, "uFade");
    const uScale = gl.getUniformLocation(program, "uScale");

    /* Roughly the width of one cell in CSS pixels. */
    const CELL_PX = 54;

    let width = 0;
    let height = 0;
    let scale = 16;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      scale = Math.max(6, rect.height / CELL_PX);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    resize();
    const observer = new ResizeObserver(() => {
      resize();
      restLamp();
    });
    observer.observe(canvas);

    /* The lamp eases toward the pointer instead of snapping to it, so light
       behaves like it has mass. */
    /* Rests over the open right-hand side, away from the headline. The visible
       x range is half the aspect ratio, so a fixed value would sit off-screen
       on a phone. */
    const target = { x: 0, y: 0.06 };
    const lamp = { x: 0, y: 0.06 };
    let pointerMoved = false;
    const restLamp = () => {
      if (pointerMoved) return;
      const rect = canvas.getBoundingClientRect();
      target.x = 0.28 * (rect.width / rect.height);
    };
    restLamp();
    lamp.x = target.x;

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerMoved = true;
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * (rect.width / rect.height);
      target.y = -((event.clientY - rect.top) / rect.height - 0.5);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    const started = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden) return;

      const elapsed = (now - started) / 1000;
      lamp.x += (target.x - lamp.x) * 0.055;
      lamp.y += (target.y - lamp.y) * 0.055;

      const rect = canvas.getBoundingClientRect();
      const fade = Math.max(0, Math.min(1, 1 + rect.bottom / rect.height - 0.15));

      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, still ? 4.2 : elapsed);
      gl.uniform2f(uLight, lamp.x, lamp.y);
      gl.uniform1f(uBuild, still ? 1 : Math.min(1, elapsed / 2.4));
      gl.uniform1f(uFade, fade);
      gl.uniform1f(uScale, scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);

    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, []);

  /* Without WebGL the hero still reads as a lit comb, just a static one. */
  if (failed) return <div className="hero-comb hero-comb-fallback" aria-hidden="true" />;

  return <canvas ref={canvasRef} className="hero-comb" aria-hidden="true" />;
}
