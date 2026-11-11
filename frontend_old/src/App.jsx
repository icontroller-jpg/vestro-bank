import React, { useEffect, useRef, useState } from "react";
import { BankProvider, bank, useBank } from "./api.js";
import { fmtDate, fmtDateTime, localToday } from "./engine/index.js";
import OtpModal from "./components/OtpModal.jsx";
import { Switch } from "./components/ui.jsx";
import { Accounts, Activity, Cards, Deposits, Loans, Login, Overview, Payments } from "./pages.jsx";

const TABS = [["overview", "Overview", Overview], ["accounts", "Accounts", Accounts], ["payments", "Payments", Payments], ["deposits", "Deposits", Deposits], ["loans", "Loans", Loans], ["cards", "Cards", Cards], ["activity", "Alerts & activity", Activity]];

function Toasts() {
  const { toasts, dismissToast } = useBank();
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "err" ? "alert" : "status"}><span>{t.text}</span><button onClick={() => dismissToast(t.id)} aria-label="Dismiss">×</button></div>)}</div>;
}

function DemoMenu() {
  const { state: s, call, toast } = useBank();
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => { const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; const k = (e) => e.key === "Escape" && setOpen(false); document.addEventListener("mousedown", f); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); }; }, []);
  return (
    <div className="demo" ref={ref}>
      <button className="btn sm ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">Demo tools</button>
      {open && <div className="menu" role="menu">
        <h3>Simulated SMS inbox</h3>
        {!s.sms.length ? <p className="muted small">No messages yet. OTPs appear here and in the verification box.</p> : <ul className="sms-list">{s.sms.slice(0, 5).map((m) => <li key={m.id}><div className="muted small">{fmtDateTime(m.ts)}</div>{m.text}</li>)}</ul>}
        <h3>Scenarios</h3>
        <div className="ctl-row"><div><b>Unfamiliar device</b><div className="muted small">Scores payments as if from a new device, so most need an OTP.</div></div><Switch checked={!s.settings.deviceTrusted} onChange={(on) => call("setDeviceTrusted", !on)} label="Unfamiliar device" /></div>
        <p className="muted small">Try: pay <code>refund.desk@vstb</code> to a new UPI ID (blocked), or ₹40,000 to Zoya Khan by NEFT (held).</p>
        <button className="btn sm danger" onClick={() => { if (window.confirm("Reset all demo data to the starting state?")) { bank.reset(); toast("Demo data reset"); setOpen(false); } }}>Reset demo data</button>
      </div>}
    </div>
  );
}

function Shell() {
  const { state: s, nav, go, call } = useBank();
  const Page = (TABS.find(([k]) => k === nav.tab) || TABS[0])[2];
  const unread = s.alerts.filter((a) => !a.read).length;
  useEffect(() => { document.title = `${TABS.find(([k]) => k === nav.tab)?.[1] || "Vestro"} · Vestro Bank (simulated)`; }, [nav.tab]);
  return (
    <>
      <header className="top">
        <div className="brand"><span className="logo">V</span><b>Vestro</b><span className="tag">SIMULATED</span><span className="muted hide-sm">Fictional bank · data as of {fmtDate(localToday())}</span></div>
        <div className="who">
          <DemoMenu />
          <button className="bell" onClick={() => go("activity")} aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}>🔔{unread > 0 && <span className="badge">{unread}</span>}</button>
          <span className="hide-sm">{s.customer.name}</span><span className="chip sm">{s.customer.segment}</span>
          <button className="btn sm" onClick={() => call("logout")}>Sign out</button>
        </div>
      </header>
      <nav className="tabs" aria-label="Main">{TABS.map(([k, t]) => <button key={k} className={nav.tab === k ? "on" : ""} aria-current={nav.tab === k ? "page" : undefined} onClick={() => go(k)}>{t}</button>)}</nav>
      <main key={nav.tab}><Page /></main>
      <footer className="foot">Vestro Bank is a fictional institution for demonstration. No real money, accounts or personal data are used. Not a financial product.</footer>
    </>
  );
}

function Gate() {
  const { state: s } = useBank();
  return s.session?.active ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <BankProvider>
      <div className="sim-banner" role="note">Simulated demonstration environment — all data is synthetic — not a real bank</div>
      <Gate />
      <OtpModal />
      <Toasts />
    </BankProvider>
  );
}
