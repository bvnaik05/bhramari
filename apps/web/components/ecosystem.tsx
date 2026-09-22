"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Fingerprint, Hexagon, Sprout } from "lucide-react";

/* Three ways into the same network. The panel swaps rather than the page
   scrolling, so the comparison stays in one place. */

const roles = [
  {
    id: "beekeeper",
    tab: "Beekeepers",
    icon: Sprout,
    title: "The work happens where the signal doesn't.",
    copy: "Your field companion from the first inspection to the next harvest. Record what you did offline, get guidance in your own language, and find a buyer for more of what the hives make.",
    points: [
      "Harvest records signed on the phone",
      "Guidance in your chosen Indian language",
      "Honey and beeswax both counted",
    ],
    view: "hives",
    varietal: "mustard",
  },
  {
    id: "partners",
    tab: "FPOs, labs & processors",
    icon: Hexagon,
    title: "One journey everybody can reconcile.",
    copy: "Bring beekeepers, collectives, laboratories and processors onto a shared record. Quantities reconcile across every split and blend, custody is explicit, and evidence attaches to the lot it actually tested.",
    points: [
      "Lot genealogy with mass balance",
      "Laboratory evidence tied to custody",
      "Buyer requirements in structured form",
    ],
    view: "lots",
    varietal: "eucalyptus",
  },
  {
    id: "everyone",
    tab: "Anyone with a jar",
    icon: Fingerprint,
    title: "The label answers back.",
    copy: "Meet the origin behind the honey. One scan opens a passport with the journey so far, the evidence that supports it, and the current safety status — with no account and nothing to install.",
    points: [
      "A unique identity for every bottle",
      "Origin and evidence in plain words",
      "Live hold and recall status",
    ],
    view: "passport",
    varietal: "litchi",
  },
] as const;

export function Ecosystem() {
  const [active, setActive] = useState(0);
  const role = roles[active];

  return (
    <section id="ecosystem" className="ecosystem section">
      <div className="shell">
        <div className="ecosystem-head">
          <div>
            <p className="marker">Who it is for</p>
            <h2 data-reveal="fill">
              Four kinds of hands
              <br />
              touch the same honey.
            </h2>
          </div>
          <p className="lede" data-reveal="rise">
            A beekeeper in a cluster, a collective that aggregates, a laboratory that tests, a buyer
            who needs certainty. Each sees the part of the record that belongs to them.
          </p>
        </div>

        <div className="role-tabs" role="tablist" aria-label="Who Bhramari is for">
          {roles.map((item, index) => (
            <button
              key={item.id}
              role="tab"
              id={`role-tab-${item.id}`}
              aria-selected={active === index}
              aria-controls="role-panel"
              className={`role-tab${active === index ? " is-active" : ""}`}
              data-varietal={item.varietal}
              onClick={() => setActive(index)}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.tab}</span>
              {active === index && (
                <motion.span
                  className="role-tab-rule"
                  layoutId="role-rule"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="role-panel" id="role-panel" role="tabpanel" aria-labelledby={`role-tab-${role.id}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={role.id}
              className="role-copy"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3>{role.title}</h3>
              <p className="prose">{role.copy}</p>
              <ul className="role-points">
                {role.points.map((point) => (
                  <li key={point}>
                    <Check size={15} strokeWidth={2.6} />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                className="link link-honey"
                href={role.view === "passport" ? "/passport/BHR-2026-0001" : `/workspace?view=${role.view}`}
              >
                {role.view === "passport" ? "Open a passport" : "See this workspace"}
              </Link>
            </motion.div>
          </AnimatePresence>

          <div className="role-art" data-varietal={role.varietal}>
            <CombLattice active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* A patch of comb where the lit cells move with the selected role. The same
   network each time — a different part of it is yours.
   Each pattern says something: one colony, then a connected network, then a
   single jar traced back to where it started. */
const patterns = [
  ["..X...", ".XX..", "..XX..", ".XX..", "..X..."],
  [".X.X..", "XXXX.", ".XX.X.", "XX.X.", ".X.X.."],
  ["....X.", "...X.", "..X...", ".X...", "X....."],
];

function CombLattice({ active }: { active: number }) {
  const rows = patterns[active];
  return (
    <div className="comb-lattice" aria-hidden="true">
      {rows.map((row, rowIndex) => (
        <div className="lattice-row" key={rowIndex} data-offset={rowIndex % 2 === 1 || undefined}>
          {row.split("").map((cell, cellIndex) => (
            <motion.span
              key={cellIndex}
              className={`lattice-cell${cell === "X" ? " is-lit" : ""}`}
              animate={{ opacity: cell === "X" ? 1 : 0.55, scale: cell === "X" ? 1 : 0.97 }}
              transition={{
                duration: 0.45,
                delay: (rowIndex + cellIndex) * 0.03,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
