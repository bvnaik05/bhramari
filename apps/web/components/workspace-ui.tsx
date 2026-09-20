"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Hexagon, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { api, display, type RecordData } from "@/lib/api";

export type Field = { name: string; label: string; type?: string; value?: string | number; required?: boolean; min?: number; max?: number; step?: number; options?: { value: string; label: string }[]; hint?: string };

export function ActionForm({ title, description, fields, submit, action = "Save record", onSuccess }: { title: string; description?: string; fields: Field[]; submit: (data: Record<string, string>) => Promise<unknown>; action?: string; onSuccess?: (result: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  return <section className="action-panel"><div className="panel-heading"><h3>{title}</h3>{description && <p>{description}</p>}</div><form className="field-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    try { const result = await submit(values); onSuccess?.(result); setNotice("Record saved successfully."); } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save this record."); } finally { setBusy(false); }
  }}>{fields.map(field => <label key={field.name} className={field.type === "textarea" ? "field full-width" : "field"}><span>{field.label}{field.required !== false && <span className="required"> *</span>}</span>{field.options ? <select name={field.name} defaultValue={field.value} required={field.required !== false}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={field.value} required={field.required !== false} rows={3} maxLength={3000} /> : <input name={field.name} type={field.type || "text"} defaultValue={field.value} required={field.required !== false} min={field.min} max={field.max} step={field.step} maxLength={field.type === "password" ? 5000 : 500} />} {field.hint && <small>{field.hint}</small>}</label>)}<div className="form-footer"><button className="button button-dark" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{busy ? "Saving…" : action}</button>{notice && <span role="status" className="success-inline"><Check size={15} />{notice}</span>}</div>{error && <div role="alert" className="notice notice-error"><TriangleAlert size={17} />{error}</div>}</form></section>;
}

export function Status({ value }: { value: unknown }) {
  const text = display(value).replaceAll("_", " ");
  return <span className={`status status-${text.toLowerCase().replaceAll(" ", "-")}`}>{text}</span>;
}

export function Empty({ children = "No records yet. Your next action starts the story." }: { children?: ReactNode }) { return <div className="empty-state"><Hexagon className="empty-hex" /><p>{children}</p></div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div className="notice notice-error" role="alert"><TriangleAlert size={18} /><span>{message}</span>{retry && <button className="text-link" onClick={retry}>Try again <RefreshCw size={14} /></button>}</div>; }

export function useRecords<T>(path: string, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api.get<T>(path).then(value => { if (!cancelled) setData(value); }).catch(failure => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, revision, reload]);
  return { data, error, loading, refresh: () => setReload(value => value + 1) };
}

export function RecordList({ title, path, columns, revision = 0, actions }: { title: string; path: string; columns: { key: string; label: string; render?: (value: unknown, row: RecordData) => ReactNode }[]; revision?: number; actions?: (row: RecordData) => ReactNode }) {
  const { data, error, loading, refresh } = useRecords<RecordData[]>(path, revision);
  return <section className="data-panel"><div className="panel-toolbar"><h3>{title}</h3><button className="icon-button" onClick={refresh} aria-label={`Refresh ${title}`}><RefreshCw size={15} /></button></div>{error ? <ErrorNotice message={error} retry={refresh} /> : loading ? <div className="loading-row"><LoaderCircle className="spin" size={18} />Loading records…</div> : !data?.length ? <Empty /> : <div className="table-scroll"><table><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}{actions && <th>Actions</th>}</tr></thead><tbody>{data.map((row, index) => <tr key={display(row.id || index)}>{columns.map(column => <td key={column.key}>{column.render ? column.render(row[column.key], row) : display(row[column.key])}</td>)}{actions && <td><div className="row-actions">{actions(row)}</div></td>}</tr>)}</tbody></table></div>}</section>;
}

export function TechnicalDetails({ data, label = "View record details" }: { data: unknown; label?: string }) { return <details className="technical-details"><summary>{label}<ChevronDown size={15} /></summary><pre>{JSON.stringify(data, null, 2)}</pre></details>; }
export const productOptions = [{ value: "honey", label: "Honey" }, { value: "beeswax", label: "Beeswax" }];
export const gramField: Field = { name: "quantity_g", label: "Quantity (grams)", type: "number", min: 1, max: 10000000, step: 1, value: 18000, hint: "Whole grams only. 1 kg = 1,000 g." };
