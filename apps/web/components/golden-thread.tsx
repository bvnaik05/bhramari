"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fingerprint, PackageCheck, ScanLine, Sprout } from "lucide-react";

/* The golden thread: one line of honey drawn through the four moments where a
   record changes hands. On wide screens the section pins in place and the
   line draws with the scroll itself, filling each node as it reaches it, and
   the page only moves on once the thread has arrived at the last step. These
   steps are numbered because the content genuinely is a sequence. */

const steps = [
  {
    icon: Sprout,
    title: "A hive is registered",
    copy: "A beekeeper, a cluster, a set of hives. This is the starting point every later record points back to.",
  },
  {
    icon: PackageCheck,
    title: "Work is recorded where it happens",
    copy: "Inspections and harvests are signed on the phone in the field, with or without a signal, and sync when one returns.",
  },
  {
    icon: Fingerprint,
    title: "Every handover is witnessed",
    copy: "Quantities reconcile across splits and blends. Laboratory evidence attaches to the exact lot it tested.",
  },
  {
    icon: ScanLine,
    title: "The story opens with a scan",
    copy: "The serial on the label resolves to origin, supporting evidence and the current safety status.",
  },
];

/* A steady wave that crosses the centre line exactly where the nodes sit, so
   the thread appears to pass behind each one. */
const THREAD_PATH = "M0 38Q150 6 300 38T600 38T900 38T1200 38";

export function GoldenThread() {
  const pathRef = useRef<SVGPathElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const section = sectionRef.current;
    if (!path || !section) return;
    /* This effect runs before the page-level motion provider's, so it
       registers the plugin itself; registering twice is harmless. */
    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();
    /* The line only exists as a horizontal wave on wide screens; phones get
       the vertical thread and no pin. */
    mm.add("(min-width: 1081px) and (prefers-reduced-motion: no-preference)", () => {
      const length = path.getTotalLength();
      const line = path.ownerSVGElement!.getBoundingClientRect();
      const nodes = Array.from(section.querySelectorAll<HTMLElement>(".thread-node"));
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(nodes, { "--lit": 0 });

      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          /* Pin with the whole section on screen; a section taller than the
             window pins by its foot instead so nothing is cut off. */
          start: () => (section.offsetHeight > window.innerHeight ? "bottom bottom" : "center center"),
          end: "+=150%",
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      /* Explicit start values: invalidateOnRefresh re-reads a plain .to()'s
         start on every refresh, and would pick up the finished state. */
      timeline.fromTo(path, { strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1 }, 0);
      /* Each node fills as the line passes its centre. */
      nodes.forEach((node) => {
        const box = node.getBoundingClientRect();
        const at = Math.min(0.97, Math.max(0, (box.left + box.width / 2 - line.left) / line.width));
        timeline.fromTo(node, { "--lit": 0 }, { "--lit": 1, duration: 0.06 }, Math.max(0, at - 0.03));
      });
      /* A short hold at the end, so the last node is seen lit before the
         section releases. */
      timeline.to({}, { duration: 0.3 });
    });

    return () => mm.revert();
  }, []);

  return (
    <section id="thread" className="thread section in-gold gold-dusk" ref={sectionRef}>
      <div className="shell">
        <div className="thread-head">
          <div>
            <p className="marker">How it works</p>
            <h2 data-reveal="fill">
              Follow the thread
              <br />
              from hive to hand.
            </h2>
          </div>
          <p className="lede" data-reveal="rise">
            Capture it locally. Reconcile it together. Anchor it permanently. Then explain it in words
            a shopper can actually read.
          </p>
        </div>

        <div className="thread-body">
          <svg
            className="thread-line"
            viewBox="0 0 1200 76"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={THREAD_PATH} stroke="rgba(122, 80, 0, 0.25)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
            <path
              ref={pathRef}
              d={THREAD_PATH}
              stroke="url(#thread-honey)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="thread-honey" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--honey-deep)" />
                <stop offset="0.5" stopColor="#e08a00" />
                <stop offset="1" stopColor="var(--gold-ink)" />
              </linearGradient>
            </defs>
          </svg>

          <ol className="thread-steps" data-reveal="settle">
            {steps.map(({ icon: Icon, title, copy }, index) => (
              <li key={title} className="thread-step">
                <span className="thread-node">
                  <Icon size={22} strokeWidth={1.5} />
                </span>
                <span className="thread-index num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
