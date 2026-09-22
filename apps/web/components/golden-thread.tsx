"use client";

import { useEffect, useRef } from "react";
import { Fingerprint, PackageCheck, ScanLine, Sprout } from "lucide-react";

/* The golden thread: one line of honey drawn through the four moments where a
   record changes hands. The line draws itself as you scroll, so the connection
   is shown rather than asserted. These steps are numbered because the content
   genuinely is a sequence. */

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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      path.style.strokeDasharray = "none";
      return;
    }

    let cancelled = false;
    let stop: (() => void) | undefined;

    import("animejs").then(({ animate, createDrawable, onScroll }) => {
      if (cancelled) return;
      const [drawable] = createDrawable(path);
      const animation = animate(drawable, {
        draw: "0 1",
        ease: "linear",
        autoplay: onScroll({
          target: section,
          enter: "bottom-=10% top",
          leave: "top+=15% bottom",
          sync: 0.55,
        }),
      });
      stop = () => animation.revert();
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <section id="thread" className="thread section" ref={sectionRef}>
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
            <path d={THREAD_PATH} stroke="var(--rule)" strokeWidth="2" strokeLinecap="round" />
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
                <stop offset="0.5" stopColor="var(--nectar)" />
                <stop offset="1" stopColor="var(--honey-deep)" />
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
