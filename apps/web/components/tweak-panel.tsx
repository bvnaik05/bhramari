"use client";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export function TweakPanel() {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV !== "development") return null;
  return <aside className="tweak-panel" aria-label="Design controls">
    {open && <div className="tweak-options"><strong>Design studio</strong><label>Rhythm<select onChange={e => document.documentElement.dataset.density = e.target.value}><option value="relaxed">Relaxed</option><option value="compact">Compact</option></select></label><label>Motion<select onChange={e => document.documentElement.dataset.motion = e.target.value}><option value="on">Organic</option><option value="off">Still</option></select></label></div>}
    <button className="icon-button" onClick={() => setOpen(!open)} aria-label={open ? "Close design controls" : "Open design controls"}>{open ? <X size={17} /> : <SlidersHorizontal size={17} />}</button>
  </aside>;
}
