"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Mic, Pause, Send, Volume2 } from "lucide-react";
import { api, display, type Hive, type Lot, type RecordData } from "@/lib/api";
import { type Language, type LanguageCapabilities } from "./language-cloud";
import { ErrorNotice, TechnicalDetails, useRecords } from "./workspace-ui";

type Reply = RecordData & { answer: string; confirmation_id?: string; requires_confirmation?: boolean; language: string };

export function MadhuView() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [language, setLanguage] = useState("en-IN");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const { data: hives } = useRecords<Hive[]>("/hives");
  const { data: lots } = useRecords<Lot[]>("/lots");
  const [context, setContext] = useState("");
  useEffect(() => { api.get<LanguageCapabilities>("/languages").then(value => {
    setLanguages(value.languages); setLanguage(value.default);
  }).catch(failure => setError(failure.message)); }, []);

  async function send(confirmationId?: string) {
    setBusy(true); setError("");
    try { setReply(await api.post<Reply>("/madhu/chat", { message, language, context_id: context || null,
      confirmation_id: confirmationId || null })); if (!confirmationId) setMessage(""); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function speak() {
    if (!reply) return;
    try { const blob = await api.audio("/languages/synthesize", { text: reply.answer, language });
      const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play();
    } catch (failure) { setError((failure as Error).message); }
  }
  async function toggleRecording() {
    if (recording) return recorder.current?.stop();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const active = new MediaRecorder(stream); recorder.current = active; chunks.current = [];
      active.ondataavailable = event => chunks.current.push(event.data);
      active.onstop = async () => { setRecording(false); stream.getTracks().forEach(track => track.stop());
        try { const form = new FormData(); form.append("audio", new Blob(chunks.current, { type: active.mimeType }), "madhu.webm"); form.append("language_code", language);
          const token = sessionStorage.getItem("bhramari.token"); const response = await fetch("/api/v1/languages/transcribe", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
          const result = await response.json(); if (!response.ok) throw new Error(result.detail || "Speech input failed"); setMessage(result.transcript);
        } catch (failure) { setError((failure as Error).message); }
      };
      active.start(); setRecording(true);
    } catch { setError("Microphone access is unavailable. You can continue with text."); }
  }
  const contextOptions = [...(hives || []).map(item => ({ id: item.id, label: `Hive · ${item.name}` })),
    ...(lots || []).map(item => ({ id: item.id, label: `Lot · ${item.code}` }))];
  return <div className="view-stack"><section className="madhu-workspace"><div className="madhu-workspace-head"><div className="voice-orb small"><AudioLines size={37} /></div><div><span className="marker">Role-aware operating assistant</span><h2>Ask Madhu</h2><p>Guidance includes a source and date. Operational actions stay as drafts until you confirm.</p></div></div>
    <div className="madhu-controls"><label className="field"><span>Language</span><select value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(item => <option key={item.code} value={item.code}>{item.native_name} · {item.name}</option>)}</select></label><label className="field"><span>Authorized context</span><select value={context} onChange={event => setContext(event.target.value)}><option value="">No hive or lot selected</option>{contextOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
    <form className="madhu-input" onSubmit={event => { event.preventDefault(); if (message.trim()) send(); }}><button type="button" className={recording ? "record-button recording" : "record-button"} onClick={toggleRecording} aria-label={recording ? "Stop recording" : "Record voice"}>{recording ? <Pause /> : <Mic />}</button><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder="Ask about this hive, draft a harvest, check a lot, or request a mentor…" maxLength={2000} /><button className="btn btn-primary" disabled={busy || !message.trim()}>{busy ? "Working…" : <><Send size={16} /> Send</>}</button></form></section>
    {error && <ErrorNotice message={error} />}{reply && <section className="madhu-reply" aria-live="polite"><div className="reply-top"><span className="marker"><AudioLines size={14} /> MADHU · {display(reply.intent)}</span><button className="icon-btn" onClick={speak} aria-label="Listen to answer"><Volume2 size={18} /></button></div><p lang={reply.language}>{reply.answer}</p>{reply.requires_confirmation && reply.confirmation_id && <div className="confirm-strip"><span>Review the draft below. This action will write an audit record.</span><button className="btn btn-honey" onClick={() => send(reply.confirmation_id)}><Check size={16} />Confirm action</button></div>}<TechnicalDetails data={reply} label="Source, draft and policy details" /></section>}
    <div className="notice"><ShieldCheckIcon /><p>Madhu does not diagnose disease, prescribe treatment, certify purity, issue recalls, or make finance decisions. It routes these requests to an authorized person.</p></div></div>;
}

function ShieldCheckIcon() { return <Check size={20} />; }
