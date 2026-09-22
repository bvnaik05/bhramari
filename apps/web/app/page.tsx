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
          </nav>
          <div className="site-header-actions">
            <Link className="btn btn-honey btn-sm header-cta" href="/workspace">
              Open the workspace
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
              Smart India Hackathon · SIH26021
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
                  <Icon size={19} strokeWidth={1.6} />
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </li>
              ))}
            </ul>
          </div>
          <a className="hero-scroll" href="#truth" aria-label="Read on">
            <span className="hero-scroll-track">
              <span className="hero-scroll-drop" />
            </span>
          </a>
        </section>

        {/* ------------------------------ truth ------------------------------ */}
        <section id="truth" className="truth in-hive">
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
        <section className="scan">
          <div className="shell scan-inner">
            <div className="scan-copy">
              <p className="marker">Try it now</p>
              <h2 data-reveal="fill">Find out what your jar knows.</h2>
              <p className="lede" data-reveal="rise">
                Every bottle carries a serial. Type one in and the passport opens: where the honey came
                from, what evidence supports it, and whether anything has been held or recalled since.
              </p>
            </div>
            <form
              className="scan-form"
              action={`/passport/${encodeURIComponent(serial.trim() || "BHR-2026-0001")}`}
              data-reveal="rise"
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
                <button type="submit" className="btn btn-primary btn-sm">
                  Open passport
                </button>
              </div>
              <span id="serial-hint" className="scan-hint">
                Letters, numbers and dashes. No login and no wallet needed.
              </span>
            </form>
          </div>
        </section>
      </main>

      <footer className="site-footer in-hive">
        <CombEdge className="edge-to-hive" />
        <div className="shell site-footer-inner">
          <div className="footer-brand">
            <Brand light />
            <p>Built for the people who keep India&apos;s hives, and everyone who opens the jar.</p>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            <Link href="/workspace">Workspace</Link>
            <Link href="/passport/BHR-2026-0001">Honey Passport</Link>
            <a href="#thread">How it works</a>
            <a href="#truth">What we prove</a>
          </nav>
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

/* The hum made visible: the sound leaves the cell as hexagons, travelling out
   through the comb rather than as generic circular ripples. */
function HumOrb() {
  return (
    <div className="hum-orb" aria-hidden="true">
      <span className="hum-glow" />
      {[0, 1, 2, 3, 4].map((ring) => (
        <span className="hum-ring" key={ring} style={{ animationDelay: `${ring * 0.74}s` }} />
      ))}
      <span className="hum-core">
        <AudioLines size={38} strokeWidth={1.4} />
      </span>
    </div>
  );
}
