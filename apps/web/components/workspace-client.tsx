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
  if (loading) return <main className="workspace-loading in-hive"><span className="pp-loading-cell" /><p>Opening Bhramari…</p></main>;
  if (!user) return <Login auth={authConfig} initialError={authError} onLogin={setUser} />;
  return <div className="workspace-shell">
    <aside className={menu ? "workspace-sidebar is-open" : "workspace-sidebar"}>
      <div className="workspace-brand"><Brand /><button className="sidebar-close" onClick={() => setMenu(false)} aria-label="Close menu"><X /></button></div>
      <nav aria-label="Workspace navigation">{navigation.map(([key, label, Icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-profile"><div className="profile-mark">{user.name.slice(0, 1)}</div><div><strong>{user.name}</strong><span>{roleLabels[user.role] || user.role}</span></div><button onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-header"><button className="workspace-menu icon-btn" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={18} /></button><div><span className="marker">Field and partner network</span><h1>{navigation.find(item => item[0] === view)?.[1] || "Workspace"}</h1></div><div className="connection-state"><span /> Connected. Records save locally when offline.</div></header>
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

const DEMO_PASSWORD = "demo-honey-2026";

const roleDuties: Record<string, string> = {
  beekeeper: "Hives, harvests and offline records", fpo: "Collect lots and accept handovers",
  processor: "Split, blend and pack lots", lab: "Attach test evidence and holds",
  buyer: "Post requirements and send enquiries", admin: "Oversee the whole cluster",
};

function Login({ auth, initialError, onLogin }: { auth?: AuthConfig; initialError: string; onLogin: (user: User) => void }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function signIn(address: string, secret: string, key: string) {
    setBusy(key); setError("");
    try {
      const session = await api.post<Session>("/auth/demo", { email: address.trim(), password: secret });
      sessionStorage.setItem("bhramari.token", session.access_token); sessionStorage.setItem("bhramari.user", JSON.stringify(session.user)); onLogin(session.user);
    } catch (failure) {
      const message = (failure as Error).message;
      setError(message === "Invalid demo credentials" ? "That email and password don’t match a demo account. Check both against the list of demo accounts." : message);
    } finally { setBusy(""); }
  }
  function pickRole(role: string) {
    const address = `${role}@bhramari.local`;
    setEmail(address); setPassword(DEMO_PASSWORD);
    signIn(address, DEMO_PASSWORD, role);
  }
  async function institutionalLogin() {
    if (!auth) return;
    setBusy("oidc"); setError("");
    try { await beginOidc(auth); } catch (failure) { setError((failure as Error).message); setBusy(""); }
  }
  const oidc = auth?.mode === "oidc";
  return <main id="main" className="login in-gold gold-noon">
    <div className="login-inner">
      <section className="login-main">
        <Brand />
        <h1>{oidc ? "Sign in to the hive economy." : "Sign in to your workspace."}</h1>
        <p className="lede">{oidc ? "Continue through your institution’s identity provider. Access is limited to enrolled participants and their assigned organisation." : "Each workspace runs real role and organisation checks. The people and records behind them are fictional competition fixtures."}</p>
        {oidc
          ? <button className="btn btn-honey login-submit" onClick={institutionalLogin} disabled={!!busy}>{busy ? "Redirecting…" : "Continue with institutional sign-in"}</button>
          : <form className="login-form" onSubmit={event => { event.preventDefault(); signIn(email, password, "form"); }}>
              <label className="field">
                <span>Email</span>
                <input type="email" name="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@organisation.org" />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
              </label>
              {error && <div className="notice notice-error" role="alert">{error}</div>}
              <button type="submit" className="btn btn-wax login-submit" disabled={!!busy || !auth}>
                {busy === "form" ? <><Activity className="spin" size={16} /> Signing in…</> : "Sign in"}
              </button>
            </form>}
        {oidc && error && <div className="notice notice-error" role="alert">{error}</div>}
      </section>

      {!oidc && <aside className="login-demo in-hive wax-card" aria-labelledby="demo-title">
        <span className="marker marker-plain"><ShieldCheck size={15} /> Simulated demo, clearly labelled</span>
        <h2 id="demo-title">Demo accounts</h2>
        <p>Pick a role to sign in straight away. Every account uses the password <code className="login-code">{DEMO_PASSWORD}</code>.</p>
        <div className="role-grid">{Object.entries(roleLabels).map(([role, label]) => <button key={role} type="button" className="role-card" onClick={() => pickRole(role)} disabled={!!busy || !auth}>
            <span className="role-cell" aria-hidden="true" />
            <strong>{label}</strong>
            <small>{roleDuties[role]}</small>
            <span className="role-email">{role}@bhramari.local</span>
            {busy === role && <Activity className="spin" size={15} />}
          </button>)}</div>
        <small className="login-note">Production mode turns demo sign-in off and requires the configured identity provider.</small>
      </aside>}
    </div>
  </main>;
}
