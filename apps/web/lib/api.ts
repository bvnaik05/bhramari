export type User = { id: string; name: string; org_id: string; role: string; email: string };
export type Hive = { id: string; name: string; region: string; floral: string; status: string };
export type Lot = { id: string; code: string; product: string; quantity_g: number; available_g: number; status: string; region: string; floral: string; owner_org_id: string; created_at: string };
export type RecordData = Record<string, unknown>;
export type Session = { access_token: string; user: User; mode: string };

export const api = {
  async get<T = RecordData>(path: string): Promise<T> { return request<T>(path); },
  async post<T = RecordData>(path: string, body: unknown): Promise<T> { return request<T>(path, "POST", body); },
  async patch<T = RecordData>(path: string, body: unknown): Promise<T> { return request<T>(path, "PATCH", body); },
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("bhramari.token") : null;
  const response = await fetch(`/api/v1${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store",
  });
  const content = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = content.detail;
    const message = Array.isArray(detail) ? detail.map((error: { loc?: string[]; msg?: string }) => `${error.loc?.slice(1).join(".")}: ${error.msg}`).join("; ") : typeof detail === "string" ? detail : `Request failed (${response.status}). Check that the API is running.`;
    throw new Error(message);
  }
  return content as T;
}

export function quantity(grams: number) { return `${(grams / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`; }
export function shortDate(value: unknown) { return typeof value === "string" ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
export function display(value: unknown): string { return value === undefined || value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value); }
