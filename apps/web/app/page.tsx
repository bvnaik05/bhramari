"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, Check, Minus, ScanLine, WifiOff } from "lucide-react";
import { Brand, CombEdge } from "@/components/brand";
import { HeroComb } from "@/components/hero-comb";
import { Ecosystem } from "@/components/ecosystem";
import { GoldenThread } from "@/components/golden-thread";
import { LanguageCloud } from "@/components/language-cloud";
import { TweakPanel } from "@/components/tweak-panel";

const heroFacts = [
  { icon: WifiOff, title: "Works with no signal", copy: "Records are signed and queued on the phone, then sync when a tower appears." },
  { icon: AudioLines, title: "Answers in your language", copy: "Ask Madhu by voice in Hindi, Bangla, Marathi and more." },
  { icon: ScanLine, title: "Opens with a scan", copy: "No app, no account, no wallet — just the serial on the label." },
];

const settled = [
  "That a harvest record existed at the time it claims",
  "That quantities still add up across a split or a blend",
  "That no accepted event was quietly edited afterwards",
  "That a recall reached every lot it touches",
];

const decided = [
  "Whether the honey meets a grade — a laboratory tests it",
  "Whether a colony is healthy — a beekeeper judges it",
  "Whether a batch may ship — a processor signs it off",
  "Whether a reported concern holds — a reviewer reads it",
];

export default function HomePage() {
  const [menu, setMenu] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [serial, setSerial] = useState("BHR-2026-0001");

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu]);

  return (
    <>
      <header className={`site-header${lifted ? " is-lifted" : ""}${menu ? " is-open" : ""}`}>
        <div className="site-header-inner shell">
          <Brand light />
          <nav className="site-nav" aria-label="Main">
            <a href="#ecosystem" onClick={() => setMenu(false)}>
              Who it is for
            </a>
            <a href="#thread" onClick={() => setMenu(false)}>
              How it works
            </a>
            <a href="#madhu" onClick={() => setMenu(false)}>
              Madhu
            </a>
            <Link href="/passport/BHR-2026-0001" onClick={() => setMenu(false)}>
              Trace a jar
            </Link>
            {/* The header CTA has no room on a phone, so it lives in the panel. */}
            <Link className="btn btn-honey nav-cta" href="/workspace" onClick={() => setMenu(false)}>
              Sign in
            </Link>
          </nav>
          <div className="site-header-actions">
            <Link className="btn btn-honey btn-sm header-cta" href="/workspace">
              Sign in
            </Link>
            <button
              className="menu-toggle"
              onClick={() => setMenu((open) => !open)}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ------------------------------- hero ------------------------------ */}
        <section className="hero in-hive">
          <HeroComb />
          <div className="hero-veil" />
          <div className="hero-inner shell">
            <p className="hero-marker" data-hero-step>
              <span className="pulse-cell" />
              Smart India Hackathon, problem SIH26021
            </p>
            <h1 className="hero-title" data-hero-words>
              <span className="hero-line" data-hero-line>
                Every jar remembers
              </span>
              <span className="hero-line" data-hero-line>
                the hive it came from.
              </span>
            </h1>
            <p className="hero-lede" data-hero-step>
              Bhramari records a beekeeper&apos;s work where there is no signal, keeps every handover
              accountable, and opens the whole journey to anyone who scans the label.
            </p>
            <div className="hero-actions" data-hero-step>
              <Link href="/workspace" className="btn btn-honey">
                Open the workspace
              </Link>
              <Link href="/passport/BHR-2026-0001" className="link link-honey">
                <ScanLine size={17} />
                Scan a jar
              </Link>
            </div>
            <ul className="hero-facts" data-hero-step>
              {heroFacts.map(({ icon: Icon, title, copy }) => (
                <li key={title}>
                  <span className="hero-fact-icon">
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------ truth ------------------------------ */}
        <section id="truth" className="truth">
          <div className="shell">
            <div className="truth-head">
              <p className="marker">The honest part</p>
              <h2 data-reveal="fill">Proof has edges.</h2>
              <p className="lede" data-reveal="rise">
                A ledger can show that a record has not changed since it was accepted. It cannot taste
                the honey. Bhramari keeps those two jobs apart, deliberately — and says which is which
                on every screen.
              </p>
            </div>
            <div className="truth-columns" data-reveal="settle">
              <article className="truth-col truth-col-settled">
                <h3>What the record settles</h3>
                <ul>
                  {settled.map((item) => (
                    <li key={item}>
                      <Check size={16} strokeWidth={2.4} />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="truth-col truth-col-decided">
                <h3>What people still decide</h3>
                <ul>
                  {decided.map((item) => (
                    <li key={item}>
                      <Minus size={16} strokeWidth={2.4} />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
          <CombEdge className="edge-to-light" />
        </section>

        {/* ---------------------------- ecosystem ---------------------------- */}
        <Ecosystem />

        {/* ------------------------- the golden thread ----------------------- */}
        <GoldenThread />

        {/* ------------------------------ madhu ------------------------------ */}
        <section id="madhu" className="madhu in-hive">
          <CombEdge className="edge-to-hive" />
          <div className="shell madhu-inner">
            <div className="madhu-copy">
              <p className="marker">The assistant</p>
              <h2 data-reveal="fill">
                Madhu listens in the
                <br />
                language you already speak.
              </h2>
              <p className="lede" data-reveal="rise">
                Ask about a hive. Record a harvest by voice. Hear a passport read aloud. Madhu works
                from what the connected provider can actually do today, and tells you plainly when
                something is out of reach.
              </p>
              <div className="madhu-actions" data-reveal="rise">
                <Link href="/workspace?view=madhu" className="btn btn-honey">
                  Say hello to Madhu
                </Link>
                <span className="madhu-note">
                  Guidance cites its source. Actions wait for your confirmation.
                </span>
              </div>
            </div>
            <div className="madhu-visual" data-reveal="rise">
              <HumOrb />
              <LanguageCloud compact />
            </div>
          </div>
          <CombEdge className="edge-to-light" />
        </section>

        {/* ----------------------------- passport ---------------------------- */}
        <section className="scan in-amber">
          <div className="shell scan-inner">
            <div className="scan-copy" data-reveal="rise">
              <p className="marker">Try it now</p>
              <h2 data-reveal="fill">Find out what your jar knows.</h2>
              <p className="lede" data-reveal="rise">
                Every bottle carries a serial. Type one in and the passport opens: where the honey came
                from, what evidence supports it, and whether anything has been held or recalled since.
              </p>
            <form
              className="scan-form"
              action={`/passport/${encodeURIComponent(serial.trim() || "BHR-2026-0001")}`}
            >
              <label htmlFor="serial">Bottle serial</label>
              <div className="scan-field">
                <ScanLine size={20} aria-hidden="true" />
                <input
                  id="serial"
                  name="serial"
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  required
                  maxLength={80}
                  pattern="[A-Za-z0-9\-]+"
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby="serial-hint"
                />
                <button type="submit" className="btn btn-honey btn-sm">
                  Open passport
                </button>
              </div>
              <span id="serial-hint" className="scan-hint">
                Letters, numbers and dashes. No login and no wallet needed.
              </span>
            </form>
            </div>
            <ScanLabel serial={serial} />
          </div>
          {/* The footer clips its own overflow for the watermark, so its teeth
              are carried here, at the foot of the section they rise into. */}
          <CombEdge className="edge-before-footer" />
        </section>
      </main>

      <footer className="site-footer in-hive">
        <div className="shell site-footer-inner">
          <div className="footer-brand">
            <Brand light />
            <p>Built for the people who keep India&apos;s hives, and everyone who opens the jar.</p>
          </div>
          <div className="footer-cols">
            <nav aria-labelledby="footer-explore">
              <h2 id="footer-explore">Explore</h2>
              <Link href="/workspace">Workspace</Link>
              <Link href="/passport/BHR-2026-0001">Honey Passport</Link>
              <a href="#ecosystem">Who it is for</a>
            </nav>
            <nav aria-labelledby="footer-understand">
              <h2 id="footer-understand">Understand</h2>
              <a href="#thread">How it works</a>
              <a href="#truth">What a record proves</a>
              <a href="#madhu">Madhu, the assistant</a>
            </nav>
          </div>
          <div className="footer-base">
            <span>© {new Date().getFullYear()} Bhramari</span>
            <span>Made in India, for India&apos;s beekeeping clusters</span>
            <span>SIH26021</span>
          </div>
        </div>
      </footer>
      <TweakPanel />
    </>
  );
}

/* The label as it appears on the jar, with a scan line passing over it. The
   cell pattern is derived from the serial, so it genuinely changes as you
   type — the thing on screen is the thing on the bottle. */
function ScanLabel({ serial }: { serial: string }) {
  const seed = serial.trim().toUpperCase() || "BHR";
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const cells = Array.from({ length: 30 }, (_, index) => {
    const bit = (hash >>> index % 32) ^ (hash * (index + 7));
    return ((bit >>> 3) & 1) === 1;
  });

  return (
    <figure className="scan-label" data-reveal="rise" aria-hidden="true">
      <div className="scan-label-card">
        <span className="scan-label-brand">bhramari</span>
        <div className="scan-label-code">
          {cells.map((filled, index) => (
            <span key={index} className={filled ? "is-filled" : undefined} />
          ))}
        </div>
        <span className="scan-label-serial num">{seed}</span>
        <span className="scan-label-note">Scan to open the passport</span>
        <span className="scan-label-beam" />
      </div>
    </figure>
  );
}

/* The hum made visible: the sound leaves the cell as hexagons, travelling out
   through the comb rather than as generic circular ripples. */
function HumOrb() {
  return (
    <div className="hum-orb" aria-hidden="true">
      <span className="hum-glow" />
      {/* Stroked polygons, not clipped borders — a clip-path would cut a
          border down to slivers where the hexagon meets the box edge. */}
      <svg className="hum-rings" viewBox="0 0 200 200" fill="none">
        {[0, 1, 2, 3, 4].map((ring) => (
          <polygon
            key={ring}
            points="100,8 180,54 180,146 100,192 20,146 20,54"
            stroke="var(--nectar)"
            strokeWidth="2"
            style={{ animationDelay: `${ring * 0.74}s` }}
          />
        ))}
      </svg>
      <span className="hum-core">
        <AudioLines size={38} strokeWidth={1.4} />
      </span>
    </div>
  );
}
