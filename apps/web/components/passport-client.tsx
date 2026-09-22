"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, CheckCircle2, CircleAlert, FileCheck2, Fingerprint, Flag,
  Loader2, MapPin, PackageCheck, ShieldCheck,
} from "lucide-react";
import { api, display, quantity, shortDate, type RecordData } from "@/lib/api";
import { Brand, CombEdge } from "./brand";
import { ErrorNotice, TechnicalDetails } from "./workspace-ui";
import { type Language, type LanguageCapabilities } from "./language-cloud";

export function PassportClient({ serial, certificate }: { serial: string; certificate?: string }) {
  const [data, setData] = useState<RecordData | null>(null);
  const [error, setError] = useState("");
  const [concern, setConcern] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const nonce = useRef("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [language, setLanguage] = useState("en-IN");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!nonce.current) nonce.current = crypto.randomUUID();
    api
      .post<RecordData>(`/passport/${encodeURIComponent(serial)}/scan`, {
        region: "Not shared",
        client_nonce: nonce.current,
        ...(certificate ? { certificate } : {}),
      })
      .then((result) => {
        setData(result.passport as RecordData);
        setScanMessage(display(result.message));
      })
      .catch((failure) => setError(failure.message));
  }, [serial, certificate]);

  useEffect(() => {
    api
      .get<LanguageCapabilities>("/languages")
      .then((value) => {
        setLanguages(value.languages);
        setLanguage(value.default);
      })
      .catch(() => setLanguages([]));
  }, []);

  async function listen() {
    if (!data) return;
    const origin = data.origin as RecordData;
    const message = `${display(data.status)}. ${display(data.product)}, ${quantity(Number(data.quantity_g))}. Origin: ${display(origin.region)}. Floral source: ${display(origin.floral)}. ${display(data.truth_boundary)}`;
    setListening(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/passport/${encodeURIComponent(serial)}/audio?language_code=${encodeURIComponent(language)}`,
      );
      if (!response.ok) throw new Error((await response.json()).detail || "Voice provider unavailable");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setListening(false);
      };
      await audio.play();
    } catch (failure) {
      if (!("speechSynthesis" in window)) {
        setError((failure as Error).message);
        setListening(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = language;
      utterance.onend = () => setListening(false);
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
  }

  if (error && !data)
    return (
      <main className="pp-error">
        <Brand />
        <ErrorNotice message={error} />
        <Link href="/" className="link">
          <ArrowLeft size={16} />
          Back to Bhramari
        </Link>
      </main>
    );

  if (!data)
    return (
      <main className="pp-loading in-hive">
        <span className="pp-loading-cell" />
        <p>Opening the passport for {serial}…</p>
      </main>
    );

  const origin = data.origin as RecordData;
  const journey = data.journey as RecordData[];
  const evidence = data.evidence as RecordData[];
  const proof = data.proof as RecordData;
  const verified = data.status === "Verified record";

  return (
    <main id="main" className="pp">
      <header className="pp-header in-hive">
        <div className="shell pp-header-inner">
          <Brand light />
          <span className="pp-header-note">Honey Passport · no login, no wallet</span>
        </div>
      </header>

      {/* --------------------------- the jar itself --------------------------- */}
      <section className="pp-hero in-hive">
        <div className="shell pp-hero-inner">
          <div className="pp-state">
            <p className="marker">Bottle {display(data.serial)}</p>
            <h1>
              {display(origin.floral)}
              <span className="pp-from">from {display(origin.region)}</span>
            </h1>
            <div className={`pp-verdict${verified ? " is-verified" : ""}`}>
              {verified ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
              <div>
                <strong>{display(data.status)}</strong>
                <span>Checked {shortDate(data.refreshed_at)}</span>
              </div>
            </div>
            <ul className="pp-facts">
              <li>
                <MapPin size={16} />
                {display(origin.region)}
              </li>
              <li>
                <Fingerprint size={16} />
                {display(origin.source_lots)} source{" "}
                {Number(origin.source_lots) === 1 ? "lot" : "lots"}
              </li>
              <li>
                <PackageCheck size={16} />
                Safety status: <span className="pp-value">{display(data.safety_status)}</span>
              </li>
            </ul>
            <div className="pp-listen">
              <label className="sr-only" htmlFor="pp-language">
                Language for spoken passport
              </label>
              <select
                id="pp-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languages.map((item) => (
                  <option value={item.code} key={item.code}>
                    {item.native_name} — {item.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-honey btn-sm" onClick={listen} disabled={listening}>
                {listening ? <Loader2 size={16} className="spin" /> : <AudioLines size={16} />}
                {listening ? "Playing" : "Hear this aloud"}
              </button>
            </div>
          </div>

          <div className="pp-jar-wrap">
            <HoneyJar
              product={display(data.product)}
              amount={quantity(Number(data.quantity_g))}
              serial={display(data.serial)}
            />
          </div>
        </div>
        <CombEdge className="edge-to-light" />
      </section>

      {scanMessage && (
        <div className="shell">
          <p className="pp-scan-note" role="status">
            <ShieldCheck size={17} />
            {scanMessage}
          </p>
        </div>
      )}

      {/* ----------------------------- the evidence ---------------------------- */}
      <section className="pp-section shell">
        <div className="pp-panels">
          <article className="pp-panel">
            <p className="marker">Current evidence</p>
            <h2>What supports this record</h2>
            {evidence.length ? (
              <ul className="pp-evidence">
                {evidence.map((item) => (
                  <li key={display(item.id)}>
                    <span className={`pp-evidence-mark${item.fresh ? " is-fresh" : ""}`}>
                      <FileCheck2 size={17} />
                    </span>
                    <div>
                      <strong>{display(item.title)}</strong>
                      <span>
                        {item.fresh ? "Current" : "Expired"} · valid until {shortDate(item.expires_at)}
                      </span>
                      <code>{display(item.sha256).slice(0, 20)}…</code>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="prose">No public evidence is attached to this lineage yet.</p>
            )}
          </article>

          <article className="pp-panel">
            <p className="marker">Tamper-evident proof</p>
            <h2>What the ledger settles</h2>
            <p className="prose">
              {proof.status === "anchored"
                ? "The latest accepted event is included in an anchored checkpoint, so it cannot be changed without showing."
                : "The record exists, but its latest checkpoint is still waiting on an online ledger receipt."}
            </p>
            <span className={`chip ${proof.status === "anchored" ? "chip-ok" : "chip-warn"}`}>
              {proof.status === "anchored" ? "Anchored" : "Awaiting receipt"}
            </span>
            <TechnicalDetails data={proof} label="Verify the technical proof" />
          </article>
        </div>
      </section>

      {/* ------------------------------ the journey ---------------------------- */}
      <section className="pp-journey">
        <div className="shell">
          <p className="marker">The journey so far</p>
          <h2>Hive to jar, one accountable step at a time.</h2>
          <ol className="pp-timeline">
            {journey.map((item, index) => (
              <li key={`${display(item.date)}-${index}`}>
                <span className="pp-timeline-node" />
                <time>{shortDate(item.date)}</time>
                <strong>{display(item.title)}</strong>
                <p>{display(item.detail)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------ the limits ----------------------------- */}
      <section className="pp-truth in-hive">
        <CombEdge className="edge-to-hive" />
        <div className="shell pp-truth-inner">
          <CircleAlert size={26} />
          <div>
            <strong>Trust has clear boundaries</strong>
            <p>{display(data.truth_boundary)}</p>
          </div>
        </div>
      </section>

      <section className="pp-concern shell">
        {concern ? (
          <ConcernForm serial={serial} close={() => setConcern(false)} />
        ) : (
          <button className="btn btn-ghost" onClick={() => setConcern(true)}>
            <Flag size={16} />
            Report a concern about this jar
          </button>
        )}
      </section>

      <footer className="pp-footer shell">
        <Brand />
        <span>Public projection refreshed from Bhramari traceability records.</span>
      </footer>
    </main>
  );
}

/* A jar of honey lit from behind: the glass carries a real depth gradient and
   the label states only what the record actually holds. */
function HoneyJar({ product, amount, serial }: { product: string; amount: string; serial: string }) {
  return (
    <figure className="pp-jar" aria-label={`${amount} of ${product}`}>
      <svg viewBox="0 0 240 330" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="jar-honey" x1="38" y1="110" x2="202" y2="304" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffd472" />
            <stop offset="0.42" stopColor="#e8930a" />
            <stop offset="1" stopColor="#8a4702" />
          </linearGradient>
          <linearGradient id="jar-glass" x1="38" y1="72" x2="202" y2="304" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffaf0" stopOpacity="0.36" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="1" stopColor="#fff3d4" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="jar-lid" x1="62" y1="14" x2="178" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7a5319" />
            <stop offset="0.32" stopColor="#4a3110" />
            <stop offset="0.68" stopColor="#8a6020" />
            <stop offset="1" stopColor="#2c1c07" />
          </linearGradient>
          <clipPath id="jar-body">
            <path d="M72 72C50 84 38 98 38 124v148c0 20 14 32 36 32h92c22 0 36-12 36-32V124c0-26-12-40-34-52Z" />
          </clipPath>
        </defs>

        {/* empty glass */}
        <path
          d="M72 72C50 84 38 98 38 124v148c0 20 14 32 36 32h92c22 0 36-12 36-32V124c0-26-12-40-34-52Z"
          fill="#2a1c08"
        />

        <g clipPath="url(#jar-body)">
          {/* honey, filled near the shoulder with a settled surface */}
          <rect x="28" y="112" width="184" height="200" fill="url(#jar-honey)" />
          <ellipse cx="120" cy="112" rx="92" ry="9" fill="#ffe09a" opacity="0.9" />
          {/* comb suspended in the honey */}
          <g opacity="0.3" fill="none" stroke="#5e3202" strokeWidth="3.4">
            <path d="M95 158l16 9.2v18.4L95 195l-16-9.2v-18.4L95 158Z" />
            <path d="M127 158l16 9.2v18.4L127 195l-16-9.2v-18.4L127 158Z" />
            <path d="M111 186l16 9.2v18.4L111 223l-16-9.2v-18.4L111 186Z" />
          </g>
          {/* the light that gets through the glass */}
          <ellipse cx="80" cy="200" rx="24" ry="88" fill="#fff4cf" opacity="0.18" />
        </g>

        {/* glass sheen over everything */}
        <path
          d="M72 72C50 84 38 98 38 124v148c0 20 14 32 36 32h92c22 0 36-12 36-32V124c0-26-12-40-34-52Z"
          fill="url(#jar-glass)"
        />
        <path
          d="M72 72C50 84 38 98 38 124v148c0 20 14 32 36 32h92c22 0 36-12 36-32V124c0-26-12-40-34-52Z"
          stroke="#ffe3a6"
          strokeOpacity="0.34"
          strokeWidth="2"
        />

        {/* label */}
        <rect x="46" y="206" width="148" height="72" rx="5" fill="#fbf3e0" />
        <path d="M120 218l10 5.8v11.6L120 241l-10-5.8v-11.6L120 218Z" fill="#c06a02" opacity="0.9" />
        <text
          x="120"
          y="259"
          textAnchor="middle"
          fill="#6b4715"
          fontSize="13"
          fontFamily="ui-monospace, monospace"
          letterSpacing="0.5"
        >
          {serial}
        </text>
        <rect x="86" y="266" width="68" height="3.5" rx="1.75" fill="#cdb689" />

        {/* neck and lid */}
        <rect x="72" y="56" width="96" height="20" rx="4" fill="#33220b" />
        <rect x="62" y="14" width="116" height="46" rx="9" fill="url(#jar-lid)" />
        {/* knurling */}
        <g stroke="#b38230" strokeOpacity="0.4" strokeWidth="2">
          <path d="M74 26v24M86 22v32M98 20v36M110 19v38M122 19v38M134 20v36M146 22v32M158 26v24" />
        </g>

        {/* highlights on the glass */}
        <path d="M62 152c0-22 5-38 14-50" stroke="#fff8e0" strokeWidth="6" strokeLinecap="round" opacity="0.42" />
        <path d="M180 176v74" stroke="#fff8e0" strokeWidth="3" strokeLinecap="round" opacity="0.2" />
      </svg>
      <figcaption>
        <strong>{product}</strong>
        <span>{amount}</span>
      </figcaption>
    </figure>
  );
}

function ConcernForm({ serial, close }: { serial: string; close: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="pp-concern-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const result = await api.post<RecordData>(`/passport/${encodeURIComponent(serial)}/concerns`, {
            category: form.get("category"),
            description: form.get("description"),
          });
          setMessage(display(result.message));
        } catch (failure) {
          setError((failure as Error).message);
        }
      }}
    >
      <div className="pp-concern-head">
        <strong>Report a concern</strong>
        <button type="button" className="link" onClick={close}>
          Close
        </button>
      </div>
      <label className="pp-field">
        <span>What is this about?</span>
        <select name="category">
          <option value="label">Label or seal</option>
          <option value="quality">Quality concern</option>
          <option value="origin">Origin information</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label className="pp-field">
        <span>What did you notice?</span>
        <textarea
          name="description"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Describe what you saw. Please leave out personal details."
        />
      </label>
      <button className="btn btn-primary">Send for human review</button>
      {message && (
        <span className="pp-sent" role="status">
          {message}
        </span>
      )}
      {error && <ErrorNotice message={error} />}
    </form>
  );
}
