"use client";

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
  return <div className={`language-cloud ${compact ? "language-cloud-compact" : ""}`} aria-label={`${capabilities.languages.length} supported languages`}>
    {languages.map(item => <span key={item.code} title={`${item.name} · ${item.tts.length ? "voice and text" : "text and speech input"}`}>{item.native_name}</span>)}
    {compact && capabilities.languages.length > languages.length && <span>+{capabilities.languages.length - languages.length} more</span>}
  </div>;
}
