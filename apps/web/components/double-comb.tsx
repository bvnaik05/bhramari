"use client";

import { useEffect, useRef } from "react";

/* A field of double-walled comb. Every cell is two hexagons: a dark wax wall
   and a lighter inside, and each cell is drawn slightly smaller than its slot
   so neighbouring walls sit side by side with a hairline of gold between
   them, the way real comb reads when you hold it up to the light. A few cells
   hold honey and shimmer slowly (anime.js); the rest vary between pale and
   deeper gold so the field never reads as a flat tile. */

const R = 34; // cell radius in viewBox units
const W = Math.sqrt(3) * R;
const COLS = 30;
const ROWS = 20;

function hex(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/* Deterministic, so server and client render the same field. */
function noise(i: number, j: number) {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const cells = Array.from({ length: ROWS }, (_, j) =>
  Array.from({ length: COLS }, (_, i) => {
    const cx = i * W + (j % 2 ? W / 2 : 0);
    const cy = j * R * 1.5;
    const n = noise(i, j);
    const kind = n > 0.93 ? "honey" : n > 0.72 ? "deep" : "pale";
    return { key: `${i}-${j}`, cx, cy, kind };
  }),
).flat();

export function DoubleComb({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("animejs").then(({ animate }) => {
      if (cancelled) return;
      /* One animation per honey cell, each offset in the cycle, so the cells
         breathe independently instead of pulsing in step. */
      const animations = Array.from(svg.querySelectorAll(".dc-glow"), (glow, index) =>
        animate(glow, {
          opacity: [0.15, 0.95],
          duration: 2600,
          delay: (index * 733) % 4200,
          ease: "inOutSine",
          loop: true,
          alternate: true,
        }),
      );
      stop = () => animations.forEach((animation) => animation.revert());
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <svg
      ref={ref}
      className={`double-comb ${className}`}
      viewBox={`0 0 ${Math.round(W * (COLS - 1))} ${Math.round(R * 1.5 * (ROWS - 1))}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dc-honey" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffd884" />
          <stop offset="0.55" stopColor="#ffb627" />
          <stop offset="1" stopColor="#c06a02" />
        </linearGradient>
      </defs>
      {cells.map(({ key, cx, cy, kind }) => (
        <g key={key} className={`dc-cell dc-${kind}`}>
          <polygon className="dc-wall" points={hex(cx, cy, R - 2.2)} />
          <polygon className="dc-inside" points={hex(cx, cy, R - 6)} />
          {kind === "honey" && <polygon className="dc-glow" points={hex(cx, cy, R - 6)} fill="url(#dc-honey)" />}
        </g>
      ))}
    </svg>
  );
}
