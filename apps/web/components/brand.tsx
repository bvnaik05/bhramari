import Link from "next/link";

export function BeeMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="m24 3 18 10.5v21L24 45 6 34.5v-21L24 3Z" stroke="currentColor" strokeWidth="2" />
    <path d="M24 18c-15-13-18 5-3 6M24 18c15-13 18 5 3 6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M18 23c0-4 12-4 12 0v8l-6 6-6-6v-8Z" fill="currentColor" />
    <path d="M18 26h12M19 31h10" stroke="var(--cream,#fffaf0)" strokeWidth="2" />
    <path d="m22 17-3-4m7 4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Bhramari home"><BeeMark /><span>bhramari<span className="brand-dot">.</span></span></Link>;
}

export function HoneyArt() {
  const cells = Array.from({ length: 81 }, (_, i) => ({ x: 94 + (i % 9) * 37 + (Math.floor(i / 9) % 2) * 18.5, y: 83 + Math.floor(i / 9) * 32 }));
  return <div className="honey-art" aria-hidden="true">
    <svg className="honey-orb" viewBox="0 0 540 540" fill="none">
      <defs>
        <radialGradient id="amber" cx=".31" cy=".23" r=".81"><stop stopColor="#fff8cb" /><stop offset=".22" stopColor="#ffd465" /><stop offset=".53" stopColor="#ed9b14" /><stop offset=".8" stopColor="#ae4b04" /><stop offset="1" stopColor="#ffdd82" /></radialGradient>
        <linearGradient id="honey-glint" x1="70" y1="40" x2="460" y2="480" gradientUnits="userSpaceOnUse"><stop stopColor="#fff9cf" /><stop offset=".5" stopColor="#ffe9a1" stopOpacity=".22" /><stop offset="1" stopColor="#713400" /></linearGradient>
        <radialGradient id="inner-glow"><stop stopColor="#fff0ae" stopOpacity=".6" /><stop offset="1" stopColor="#ffb628" stopOpacity="0" /></radialGradient>
        <clipPath id="orb-clip"><path d="M470 276c-3 114-82 213-198 205S58 396 65 264 156 57 274 62s199 99 196 214Z" /></clipPath>
        <filter id="orb-shadow"><feGaussianBlur stdDeviation="13" /></filter>
      </defs>
      <ellipse cx="278" cy="488" rx="158" ry="15" fill="#b7782f" opacity=".2" filter="url(#orb-shadow)" />
      <g className="orb-body">
        <path d="M470 276c-3 114-82 213-198 205S58 396 65 264 156 57 274 62s199 99 196 214Z" fill="url(#amber)" />
        <g clipPath="url(#orb-clip)" transform="rotate(-22 270 270)">
          {cells.map((cell, i) => <path key={i} d={`M${cell.x} ${cell.y - 21}l18 10.5v21l-18 10.5-18-10.5v-21Z`} fill={i % 7 === 0 ? "#ffd663" : "none"} fillOpacity=".25" stroke="url(#honey-glint)" strokeWidth="3" />)}
          <ellipse cx="175" cy="130" rx="250" ry="125" fill="url(#inner-glow)" />
        </g>
        <path d="M98 264c1-89 61-157 139-170" stroke="#fffbd8" strokeWidth="5" strokeLinecap="round" opacity=".75" />
        <path d="M424 313c-22 84-72 126-142 137" stroke="#ffdc78" strokeWidth="3" strokeLinecap="round" opacity=".6" />
        <ellipse cx="156" cy="133" rx="29" ry="14" transform="rotate(-39 156 133)" fill="#fffce3" opacity=".55" />
      </g>
      <ellipse cx="267" cy="271" rx="254" ry="90" transform="rotate(-28 267 271)" stroke="#b27e29" strokeOpacity=".26" strokeDasharray="3 6" />
      <circle cx="479" cy="170" r="6" fill="#8c540d" /><circle cx="61" cy="377" r="5" fill="#d79d29" />
    </svg>
    <div className="art-label art-label-top"><span className="tiny-dot" /> ROOTED IN NATURE</div>
    <div className="art-label art-label-bottom"><span className="tiny-dot" /> CONNECTED BY TRUST</div>
  </div>;
}
