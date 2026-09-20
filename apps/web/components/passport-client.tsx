"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, AudioLines, CheckCircle2, CircleAlert, FileCheck2, Fingerprint, Flag, Hexagon, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { api, display, quantity, shortDate, type RecordData } from "@/lib/api";
import { Brand } from "./brand";
import { ErrorNotice, TechnicalDetails } from "./workspace-ui";
import { type Language, type LanguageCapabilities } from "./language-cloud";

export function PassportClient({ serial }: { serial: string }) {
  const [data, setData] = useState<RecordData | null>(null); const [error, setError] = useState(""); const [concern, setConcern] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]); const [language, setLanguage] = useState("en-IN"); const [listening, setListening] = useState(false);
  useEffect(() => { api.get<RecordData>(`/passport/${encodeURIComponent(serial)}`).then(setData).catch(failure => setError(failure.message)); }, [serial]);
  useEffect(() => { api.get<LanguageCapabilities>("/languages").then(value => { setLanguages(value.languages); setLanguage(value.default); }).catch(() => setLanguages([])); }, []);
  async function listen() {
    if (!data) return;
    const origin = data.origin as RecordData; const message = `${display(data.status)}. ${display(data.product)}, ${quantity(Number(data.quantity_g))}. Origin: ${display(origin.region)}. Floral source: ${display(origin.floral)}. ${display(data.truth_boundary)}`;
    setListening(true); setError("");
    try { const response = await fetch(`/api/v1/passport/${encodeURIComponent(serial)}/audio?language_code=${encodeURIComponent(language)}`); if (!response.ok) throw new Error((await response.json()).detail || "Voice provider unavailable"); const url = URL.createObjectURL(await response.blob()); const audio = new Audio(url); audio.onended = () => { URL.revokeObjectURL(url); setListening(false); }; await audio.play(); }
    catch (failure) { if (!("speechSynthesis" in window)) { setError((failure as Error).message); setListening(false); return; } const utterance = new SpeechSynthesisUtterance(message); utterance.lang = language; utterance.onend = () => setListening(false); speechSynthesis.cancel(); speechSynthesis.speak(utterance); }
  }
  if (error && !data) return <main className="passport-error"><Brand /><ErrorNotice message={error} /><Link href="/" className="text-link"><ArrowLeft />Return home</Link></main>;
  if (!data) return <main className="passport-loading">Resolving the Honey Passport…</main>;
  const origin = data.origin as RecordData; const journey = data.journey as RecordData[]; const evidence = data.evidence as RecordData[]; const proof = data.proof as RecordData;
  const verified = data.status === "Verified record";
  return <main id="main" className="passport-page"><header className="passport-header"><Brand /><span>Honey Passport · no login or wallet</span></header>
    <section className="passport-hero"><div className="passport-state"><div className={verified ? "passport-seal verified" : "passport-seal"}>{verified ? <CheckCircle2 /> : <CircleAlert />}</div><div><span className="eyebrow">LIVE BOTTLE STATUS</span><h1>{display(data.status)}</h1><p>Refreshed {shortDate(data.refreshed_at)}</p></div></div><div className="passport-audio"><select aria-label="Passport audio language" value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(item => <option value={item.code} key={item.code}>{item.native_name} · {item.name}</option>)}</select><button className="button button-light" onClick={listen} disabled={listening}><AudioLines size={18} />{listening ? "Playing…" : "Listen to this passport"}</button></div></section>
    <section className="passport-product"><div className="jar-illustration"><div className="jar-lid" /><div className="jar-body"><Hexagon size={65} /><strong>Bhramari</strong><span>{display(data.product)}</span></div></div><div><span className="eyebrow">BOTTLE {display(data.serial)}</span><h2>{display(origin.floral)}<br /><span className="serif-word">from {display(origin.region)}.</span></h2><p>{quantity(Number(data.quantity_g))} packed from an accountable lot genealogy. The producer story is shown at cluster level to protect exact hive locations.</p><div className="passport-facts"><span><MapPin />{display(origin.region)}</span><span><Fingerprint />{display(origin.source_lots)} source lot(s)</span><span><PackageCheck />{display(data.safety_status)}</span></div></div></section>
    <section className="passport-grid"><article className="passport-panel"><span className="eyebrow"><FileCheck2 size={15} /> CURRENT EVIDENCE</span><h2>What supports this record</h2>{evidence.length ? evidence.map(item => <div className="evidence-card" key={display(item.id)}><FileCheck2 /><div><strong>{display(item.title)}</strong><span>Valid until {shortDate(item.expires_at)} · {item.fresh ? "current" : "expired"}</span><small>Hash {display(item.sha256).slice(0, 18)}…</small></div></div>) : <p>No public evidence is attached to this lineage.</p>}</article><article className="passport-panel"><span className="eyebrow"><ShieldCheck size={15} /> TAMPER-EVIDENT PROOF</span><h2>What the ledger proves</h2><p>{proof.status === "anchored" ? "The latest accepted event is included in an anchored Merkle checkpoint." : "The record exists, but its latest checkpoint still needs an online ledger receipt."}</p><TechnicalDetails data={proof} label="Verify the technical proof" /></article></section>
    <section className="passport-journey"><span className="eyebrow">THE JOURNEY SO FAR</span><h2>Hive to jar, one accountable step at a time.</h2><div className="timeline">{journey.map((item, index) => <article key={`${display(item.date)}-${index}`}><span className="timeline-dot" /><small>{shortDate(item.date)}</small><strong>{display(item.title)}</strong><p>{display(item.detail)}</p></article>)}</div></section>
    <section className="truth-card"><CircleAlert /><div><strong>Trust has clear boundaries</strong><p>{display(data.truth_boundary)}</p></div></section>
    {concern ? <ConcernForm serial={serial} close={() => setConcern(false)} /> : <button className="report-button" onClick={() => setConcern(true)}><Flag size={16} />Report a concern about this jar</button>}
    <footer className="passport-footer"><Brand /><span>Public projection refreshed from Bhramari traceability records.</span></footer>
  </main>;
}

function ConcernForm({ serial, close }: { serial: string; close: () => void }) {
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  return <form className="concern-form" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const result = await api.post<RecordData>(`/passport/${encodeURIComponent(serial)}/concerns`, { category: form.get("category"), description: form.get("description") }); setMessage(display(result.message)); } catch (failure) { setError((failure as Error).message); } }}><div><strong>Report a concern</strong><button type="button" className="text-link" onClick={close}>Close</button></div><select name="category"><option value="label">Label or seal</option><option value="quality">Quality concern</option><option value="origin">Origin information</option><option value="other">Other</option></select><textarea name="description" minLength={10} maxLength={2000} required placeholder="Describe what you observed. Do not include sensitive personal information." /><button className="button button-dark">Send for human review</button>{message && <span className="success-inline">{message}</span>}{error && <ErrorNotice message={error} />}</form>;
}
