"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Language = {
  code: string;
  name: string;
  native_name: string;
  text: boolean;
  stt: string[];
  tts: string[];
};

export type LanguageCapabilities = {
  default: string;
  languages: Language[];
  providers: Record<string, boolean>;
  live_voice: boolean;
};

export function LanguageCloud({ compact = false }: { compact?: boolean }) {
  const [capabilities, setCapabilities] = useState<LanguageCapabilities | null>(null);
  useEffect(() => {
    api.get<LanguageCapabilities>("/languages").then(setCapabilities).catch(() => setCapabilities(null));
  }, []);
  if (!capabilities)
    return <div className="language-cloud language-cloud-compact"><span>Language list loads with the API</span></div>;
  const languages = compact ? capabilities.languages.filter(item => item.tts.length).slice(0, 8) : capabilities.languages;
  /* Each language opens Madhu already set to it. */
  return <div className={`language-cloud ${compact ? "language-cloud-compact" : ""}`} aria-label={`${capabilities.languages.length} supported languages`}>
    {languages.map(item => <Link key={item.code} lang={item.code} href={`/workspace?view=madhu&lang=${item.code}`} title={`Talk to Madhu in ${item.name}`}>{item.native_name}</Link>)}
    {compact && capabilities.languages.length > languages.length && <Link href="/workspace?view=madhu">+{capabilities.languages.length - languages.length} more</Link>}
  </div>;
}
