import Link from "next/link";
import { useId } from "react";

/* Bhramari is the humming bee — the name is also the bee-breath. The mark
   makes the hum literal: the bee's stripes carry on past its body as sound,
   held inside a single comb cell. */
export function BeeMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 2.5 42.5 13.25v21.5L24 45.5 5.5 34.75v-21.5L24 2.5Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* the hum */}
      <path
        d="M11.5 20.5c-1.6 2.2-1.6 5 0 7.2M36.5 20.5c1.6 2.2 1.6 5 0 7.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity=".55"
      />
      {/* wings */}
      <ellipse cx="16.6" cy="20.6" rx="4.6" ry="3" transform="rotate(-32 16.6 20.6)" fill="currentColor" opacity=".32" />
      <ellipse cx="31.4" cy="20.6" rx="4.6" ry="3" transform="rotate(32 31.4 20.6)" fill="currentColor" opacity=".32" />
      {/* head and antennae */}
      <circle cx="24" cy="15.4" r="3.5" fill="currentColor" />
      <path d="M22 11.6 20.4 9M26 11.6 27.6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* body */}
      <path
        d="M24 19.2c4.1 0 6.4 2.5 6.4 6.3 0 4.6-2.9 8.7-6.4 11.1-3.5-2.4-6.4-6.5-6.4-11.1 0-3.8 2.3-6.3 6.4-6.3Z"
        fill="currentColor"
      />
      <path
        d="M18.2 24.6h11.6M19.3 29.4h9.4M21.4 34h5.2"
        stroke="var(--stripe, #fffaf0)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand${compact ? " brand-compact" : ""}`}
      aria-label="Bhramari, home"
    >
      <span className="brand-mark">
        <BeeMark />
      </span>
      <span className="brand-word">bhramari</span>
    </Link>
  );
}

/* The boundary between sections is a row of comb teeth rather than a rule.
   A pattern tiles at a fixed size, so the teeth keep their shape at any width
   instead of stretching. Each edge needs its own pattern id: a shared one
   resolves currentColor against the first edge, painting every edge its colour. */
export function CombEdge({ flip = false, className = "" }: { flip?: boolean; className?: string }) {
  const id = `comb-tooth${useId().replace(/:/g, "")}`;
  return (
    <div className={`comb-edge${flip ? " comb-edge-flip" : ""} ${className}`} aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* The top half of a row of flat-top cells: each tooth is wide at its
              base and narrow at its crest, so the gaps between them read as
              the V where two cells meet. */}
          <pattern id={id} width="64" height="28" patternUnits="userSpaceOnUse">
            <path d="M0 28 16 0h32l16 28Z" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/* A hexagon that can be filled to a level — used wherever a quantity or a
   degree of completeness is being shown. */
export function HexCell({
  fill = 1,
  label,
  className = "",
}: {
  fill?: number;
  label?: string;
  className?: string;
}) {
  const level = Math.max(0, Math.min(1, fill));
  return (
    <span className={`hex-cell ${className}`} role={label ? "img" : undefined} aria-label={label}>
      <span className="hex-cell-fill" style={{ height: `${level * 100}%` }} />
    </span>
  );
}
