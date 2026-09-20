"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, AudioLines, Boxes, CircleGauge, FlaskConical, Handshake, HeartHandshake, Hexagon,
  LayoutDashboard, LogOut, Menu, PackageOpen, Radio, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { api, type Session, type User } from "@/lib/api";
import { beginOidc, finishOidc, type AuthConfig } from "@/lib/oidc";
import { Brand } from "./brand";
import { HivesView, Overview, QueueView } from "./field-views";
import { CustodyView, EvidenceView, LotsView } from "./traceability-views";
import { AssistedView, CirclesView, ControlView, MarketView, SensorsView } from "./operations-views";
import { MadhuView } from "./madhu-view";

const navigation = [
  ["overview", "Overview", LayoutDashboard], ["hives", "Hives & harvest", Hexagon], ["queue", "Offline vault", Smartphone],
  ["lots", "Lots & packaging", Boxes], ["custody", "Custody & shipping", PackageOpen], ["evidence", "Evidence & recalls", FlaskConical],
  ["market", "Buyer market", Handshake], ["circles", "Bee Circles", Users], ["sensors", "Hive intelligence", Radio],
  ["madhu", "Madhu", AudioLines], ["assisted", "Assisted access", HeartHandshake], ["control", "Control tower", CircleGauge],
] as const;

const roleLabels: Record<string, string> = { beekeeper: "Beekeeper", fpo: "FPO coordinator", processor: "Processor",
  lab: "Laboratory", buyer: "Buyer", admin: "Cluster administrator" };

export function WorkspaceClient() {
  const search = useSearchParams();
  const [view, setView] = useState(search.get("view") || "overview");
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig>();
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    async function open() {
      try {
        const config = await api.get<AuthConfig>("/auth/config");
        setAuthConfig(config);
        const query = new URLSearchParams(window.location.search);
        const code = query.get("code");
        if (code) {
          const token = await finishOidc(config, code, query.get("state") || "");
          sessionStorage.setItem("bhramari.token", token);
          window.history.replaceState({}, "", "/workspace");
        }
        if (sessionStorage.getItem("bhramari.token")) setUser(await api.get<User>("/auth/me"));
      } catch (failure) {
        sessionStorage.removeItem("bhramari.token");
        setAuthError((failure as Error).message);
      } finally { setLoading(false); }
    }
    open();
  }, []);
  function navigate(next: string) {
    setView(next); setMenu(false); window.history.replaceState({}, "", `/workspace?view=${next}`);
  }
  function signOut() { sessionStorage.removeItem("bhramari.token"); sessionStorage.removeItem("bhramari.user"); setUser(null); }
  if (loading) return <main className="workspace-loading">Opening Bhramari…</main>;
  if (!user) return <Login auth={authConfig} initialError={authError} onLogin={setUser} />;
  return <div className="workspace-shell">
    <aside className={menu ? "workspace-sidebar is-open" : "workspace-sidebar"}>
      <div className="workspace-brand"><Brand light /><button className="sidebar-close" onClick={() => setMenu(false)} aria-label="Close menu"><X /></button></div>
      <nav aria-label="Workspace navigation">{navigation.map(([key, label, Icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-profile"><div className="profile-mark">{user.name.slice(0, 1)}</div><div><strong>{user.name}</strong><span>{roleLabels[user.role] || user.role}</span></div><button onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-header"><button className="workspace-menu" onClick={() => setMenu(true)} aria-label="Open menu"><Menu /></button><div><span className="eyebrow">BHRAMARI FIELD & PARTNER NETWORK</span><h1>{navigation.find(item => item[0] === view)?.[1] || "Workspace"}</h1></div><div className="connection-state"><span /> Connected · records save locally when offline</div></header>
      <main id="main" className="workspace-content">{renderView(view, user, navigate)}</main>
    </div>
  </div>;
}

function renderView(view: string, user: User, navigate: (view: string) => void) {
  if (view === "hives") return <HivesView user={user} />;
  if (view === "queue") return <QueueView user={user} />;
  if (view === "lots") return <LotsView />;
  if (view === "custody") return <CustodyView />;
  if (view === "evidence") return <EvidenceView />;
  if (view === "market") return <MarketView user={user} />;
  if (view === "circles") return <CirclesView />;
  if (view === "sensors") return <SensorsView />;
  if (view === "madhu") return <MadhuView />;
  if (view === "assisted") return <AssistedView />;
  if (view === "control") return <ControlView />;
  return <Overview user={user} navigate={navigate} />;
}

function Login({ auth, initialError, onLogin }: { auth?: AuthConfig; initialError: string; onLogin: (user: User) => void }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState("");
  async function login(role: string) {
    setBusy(role); setError("");
    try {
      const session = await api.post<Session>("/auth/demo", { email: `${role}@bhramari.local`, password: "demo-honey-2026" });
      sessionStorage.setItem("bhramari.token", session.access_token); sessionStorage.setItem("bhramari.user", JSON.stringify(session.user)); onLogin(session.user);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(""); }
  }
  async function institutionalLogin() {
    if (!auth) return;
    setBusy("oidc"); setError("");
    try { await beginOidc(auth); } catch (failure) { setError((failure as Error).message); setBusy(""); }
  }
  return <main id="main" className="login-page"><Brand /><section className="login-card"><span className="eyebrow"><ShieldCheck size={15} /> {auth?.mode === "oidc" ? "VERIFIED PARTICIPANT ACCESS" : "EXPLICIT SIMULATED DEMO"}</span><h1>{auth?.mode === "oidc" ? <>Sign in to the<br /><span className="serif-word">hive economy.</span></> : <>Choose your place<br />in the <span className="serif-word">hive economy.</span></>}</h1><p>{auth?.mode === "oidc" ? "Continue through your institution’s identity provider. Access is limited to enrolled participants and their assigned organization." : "Each workspace uses real role and organization checks. Seeded people and records are fictional competition fixtures."}</p>{auth?.mode === "oidc" ? <button className="primary-button" onClick={institutionalLogin} disabled={!!busy}>{busy ? "Redirecting…" : "Continue with institutional sign-in"}</button> : <div className="role-grid">{Object.entries(roleLabels).map(([role, label]) => <button key={role} onClick={() => login(role)} disabled={!!busy || !auth}><span>{label}</span><small>{role === "beekeeper" ? "Field records and offline capture" : role === "buyer" ? "Requirements and enquiries" : role === "lab" ? "Evidence and restrictions" : "Operations and accountable handoffs"}</small>{busy === role && <Activity className="spin" size={16} />}</button>)}</div>}{error && <div className="notice notice-error">{error}</div>}{auth?.mode === "demo" && <small className="login-note">Production mode disables demo sign-in and requires the configured OIDC provider.</small>}</section></main>;
}
