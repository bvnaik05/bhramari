import { api, type User } from "./api";

type Device = { user_id: string; id: string; signing: CryptoKey; encryption: CryptoKey; sequence: number; previous: string };
export type QueueItem = { event_id: string; actor_id: string; sequence: number; status: string; created_at: string; iv: Uint8Array; encrypted: ArrayBuffer; receipt?: unknown };
type Envelope = Record<string, unknown> & { event_id: string; signature: string };
const encoder = new TextEncoder();

export class FieldVault {
  static async ready(user: User) {
    return !!await read<Device>("devices", user.id);
  }

  static async provision(user: User) {
    return navigator.locks.request(`bhramari:${user.id}`, async () => {
      if (await this.ready(user)) return;
      const keys = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]) as CryptoKeyPair;
      const encryption = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const publicKey = base64(await crypto.subtle.exportKey("raw", keys.publicKey));
      const device = await api.post<{ id: string }>("/devices", { name: "Bhramari browser field vault", public_key: publicKey });
      await write("devices", { user_id: user.id, id: device.id, signing: keys.privateKey, encryption, sequence: 0, previous: "" });
    });
  }

  static async capture(user: User, type: "harvest" | "inspection", subject: string, payload: Record<string, unknown>) {
    return navigator.locks.request(`bhramari:${user.id}`, async () => {
      const device = await read<Device>("devices", user.id);
      if (!device) throw new Error("Enable the secure field vault while online before capturing offline.");
      const unsigned = { schema_version: 1, event_id: uuid7(), actor_id: user.id, organisation_id: user.org_id, event_type: type, subject_id: subject, occurred_at: new Date().toISOString(), device_sequence: device.sequence + 1, previous_event_hash: device.previous, payload_hash: await hash(canonical(payload)), attachment_hashes: [], key_id: device.id, capture_mode: "OFFLINE", payload };
      const signature = base64(await crypto.subtle.sign("Ed25519", device.signing, encoder.encode(canonical(unsigned))));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, device.encryption, encoder.encode(canonical({ ...unsigned, signature })));
      const nextDevice = { ...device, sequence: unsigned.device_sequence, previous: await hash(canonical(unsigned)) };
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(["devices", "queue"], "readwrite");
        transaction.objectStore("devices").put(nextDevice);
        transaction.objectStore("queue").put({ event_id: unsigned.event_id, actor_id: user.id, sequence: unsigned.device_sequence, status: "pending", created_at: unsigned.occurred_at, iv, encrypted });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Local save was interrupted. Please retry."));
      });
      return unsigned.event_id;
    });
  }

  static async list(user: User): Promise<QueueItem[]> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction("queue").objectStore("queue").getAll();
      request.onsuccess = () => resolve((request.result as QueueItem[]).filter(item => item.actor_id === user.id).sort((a, b) => a.sequence - b.sequence));
      request.onerror = () => reject(request.error);
    });
  }

  static async sync(user: User) {
    return navigator.locks.request(`bhramari:${user.id}`, async () => {
      const device = await read<Device>("devices", user.id);
      if (!device) throw new Error("This browser has no registered device.");
      const items = (await this.list(user)).filter(item => item.status === "pending" || item.status === "rejected").slice(0, 100);
      if (!items.length) return 0;
      const events: Envelope[] = [];
      for (const item of items) {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(item.iv) }, device.encryption, item.encrypted);
        events.push(JSON.parse(new TextDecoder().decode(plain)) as Envelope);
      }
      const result = await api.post<{ receipts: { event_id: string; status: string }[] }>("/sync", { events });
      for (const receipt of result.receipts) {
        const item = items.find(entry => entry.event_id === receipt.event_id);
        if (item) await write("queue", { ...item, status: receipt.status, receipt });
      }
      return result.receipts.filter(item => item.status === "accepted").length;
    });
  }
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key.normalize("NFC"))}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(typeof value === "string" ? value.normalize("NFC") : value);
}

async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))), byte => byte.toString(16).padStart(2, "0")).join(""); }
function base64(buffer: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
function uuid7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let milliseconds = BigInt(Date.now());
  for (let index = 5; index >= 0; index--) { bytes[index] = Number(milliseconds & 255n); milliseconds >>= 8n; }
  bytes[6] = (bytes[6] & 15) | 112;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bhramari-field-vault", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("devices", { keyPath: "user_id" }); request.result.createObjectStore("queue", { keyPath: "event_id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(store: string, key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).get(key); request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(request.error); });
}
async function write(store: string, value: unknown): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => { const transaction = db.transaction(store, "readwrite"); transaction.objectStore(store).put(value); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
}
