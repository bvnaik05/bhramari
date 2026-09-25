"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, Check, FileCheck2, ScanLine, UserRound, Users, WifiOff } from "lucide-react";
import { Brand, CombEdge } from "@/components/brand";
import { HeroComb } from "@/components/hero-comb";
import { Ecosystem } from "@/components/ecosystem";
import { GoldenThread } from "@/components/golden-thread";
import { LanguageCloud } from "@/components/language-cloud";
import { DoubleComb } from "@/components/double-comb";
import { TweakPanel } from "@/components/tweak-panel";

const heroFacts = [
  { icon: WifiOff, title: "Works with no signal", copy: "Records are signed and queued on the phone, then sync when a tower appears." },
  { icon: AudioLines, title: "Answers in your language", copy: "Ask Madhu by voice in Hindi, Bangla, Marathi and more." },
  { icon: ScanLine, title: "Opens with a scan", copy: "No app, account or wallet. Just the serial on the label." },
];

/* The two halves of trust, written as plainly as a beekeeper would say them. */
const proofCards = [
  {
    id: "record",
    icon: FileCheck2,
    mark: Check,
    title: "The record shows",
    who: "Checked by Bhramari",
    items: [
      "When a harvest was recorded, and who recorded it",
      "That the weights still add up after a split or a blend",
      "That nobody changed a record once it was accepted",
      "Every lot a recall reaches",
    ],
  },
  {
    id: "people",
    icon: Users,
    mark: UserRound,
    title: "People decide",
    who: "Checked by a person",
    items: [
      "Whether the honey meets its grade. A lab tests it.",
      "Whether a colony is healthy. The beekeeper judges.",
      "Whether a batch can ship. The processor signs off.",
      "Whether a complaint holds up. A reviewer reads it.",
    ],
  },
];

export default function HomePage() {
  const [menu, setMenu] = useState(false);
  const [lifted, setLifted] = useState(false);
  /* Past the hero the page is gold, so the header turns to light glass. */
  const [light, setLight] = useState(false);
  const [serial, setSerial] = useState("BHR-2026-0001");

  useEffect(() => {
    const onScroll = () => {
      setLifted(window.scrollY > 40);
      const hero = document.querySelector(".hero");
      setLight(!!hero && hero.getBoundingClientRect().bottom < 72);
    };
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
      <header className={`site-header${lifted ? " is-lifted" : ""}${light ? " is-light" : ""}${menu ? " is-open" : ""}`}>
        <div className="site-header-inner shell">
          <Brand />
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
          <CombEdge className="edge-to-light" />
        </section>

        {/* ------------------------------ truth ------------------------------ */}
        <section id="truth" className="truth in-gold gold-dawn">
          <div className="shell">
            <div className="truth-head">
              <p className="marker">What a record can prove</p>
              <h2 data-reveal="fill">A ledger can&apos;t taste honey.</h2>
              <p className="lede" data-reveal="rise">
                Bhramari can show that nobody changed a harvest record after it was saved. It can&apos;t
                tell you whether the honey is good. That still takes a lab, a beekeeper and a buyer, so
                every screen tells you which is which.
              </p>
            </div>
            <div className="truth-columns" data-reveal="settle">
              {proofCards.map(({ id, icon: Icon, mark: Mark, title, who, items }) => (
                <article key={id} className="truth-col in-hive">
                  <div className="truth-col-head">
                    <span className="truth-col-icon">
                      <Icon size={20} strokeWidth={1.6} />
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <span>{who}</span>
                    </div>
                  </div>
                  <ul>
                    {items.map((item) => (
                      <li key={item}>
                        <Mark size={16} strokeWidth={2.2} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
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
          <DoubleComb />
          <div className="shell madhu-inner">
            <div className="madhu-copy">
              <p className="marker">The assistant</p>
              <h2 data-reveal="fill">
                Madhu listens in the
                <br />
                language you already speak.
              </h2>
              <p className="lede" data-reveal="rise">
                Ask about a hive, record a harvest by voice, or hear a passport read aloud. When Madhu
                can&apos;t do something yet, it tells you so instead of guessing.
              </p>
              <div className="madhu-actions" data-reveal="rise">
                <Link href="/workspace?view=madhu" className="btn btn-honey">
                  Say hello to Madhu
                </Link>
                <span className="madhu-note">
                  Every answer cites its source. Nothing is saved until you confirm.
                </span>
              </div>
            </div>
            <div className="madhu-visual" data-reveal="rise">
              <HumOrb />
              <LanguageCloud compact />
              <span className="madhu-note">Tap a language to talk to Madhu in it.</span>
            </div>
          </div>
          <CombEdge className="edge-to-light" />
        </section>

        {/* ----------------------------- passport ---------------------------- */}
        <section className="scan in-gold">
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
                <button type="submit" className="btn btn-wax btn-sm">
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

      <footer className="site-footer in-gold gold-deep">
        <div className="shell site-footer-inner">
          <div className="footer-brand">
            <Brand />
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
            stroke="var(--nectar-ink)"
            strokeWidth="1.6"
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
