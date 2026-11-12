
import React, { useEffect, useRef, useState } from "react";

import { BankProvider, bank, useBank } from "./api.js";
import { api, setToken } from "./consoleApi.js";

import { fmtDate, fmtDateTime, localToday } from "./engine/index.js";
import OtpModal from "./components/OtpModal.jsx";
import { Switch } from "./components/ui.jsx";

import {
  Accounts,
  Activity,
  Cards,
  Deposits,
  Loans,
  Login,
  Overview,
  Payments
} from "./pages.jsx";

import InstitutionConsole from "./InstitutionConsole.jsx";

// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

const TABS = [
  ["overview", "Overview", Overview],
  ["accounts", "Accounts", Accounts],
  ["payments", "Payments", Payments],
  ["deposits", "Deposits", Deposits],
  ["loans", "Loans", Loans],
  ["cards", "Cards", Cards],
  ["activity", "Alerts & activity", Activity]
];

// --------------------------------------------------
// NOTIFICATIONS
// --------------------------------------------------

function Toasts() {
  const { toasts, dismissToast } = useBank();

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          role={t.kind === "err" ? "alert" : "status"}
        >
          <span>{t.text}</span>

          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------
// CUSTOMER DEMO MENU
// --------------------------------------------------

function DemoMenu() {
  const { state: s, call, toast } = useBank();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };

    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="demo" ref={ref}>
      <button
        className="btn sm ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Demo tools
      </button>

      {open && (
        <div className="menu" role="menu">
          <h3>Simulated SMS inbox</h3>

          {!s.sms.length ? (
            <p className="muted small">
              No messages yet. OTPs appear here and in the verification box.
            </p>
          ) : (
            <ul className="sms-list">
              {s.sms.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <div className="muted small">
                    {fmtDateTime(m.ts)}
                  </div>
                  {m.text}
                </li>
              ))}
            </ul>
          )}

          <h3>Scenarios</h3>

          <div className="ctl-row">
            <div>
              <b>Unfamiliar device</b>
              <div className="muted small">
                Scores payments as if from a new device, so most need an OTP.
              </div>
            </div>

            <Switch
              checked={!s.settings.deviceTrusted}
              onChange={(on) => call("setDeviceTrusted", !on)}
              label="Unfamiliar device"
            />
          </div>

          <p className="muted small">
            Try: pay <code>refund.desk@vstb</code> to a new UPI ID
            (blocked), or ₹40,000 to Zoya Khan by NEFT (held).
          </p>

          <button
            className="btn sm danger"
            onClick={() => {
              if (window.confirm("Reset all demo data to the starting state?")) {
                bank.reset();
                toast("Demo data reset");
                setOpen(false);
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// CUSTOMER BANKING DASHBOARD
// --------------------------------------------------

function Shell() {
  const { state: s, nav, go, call } = useBank();

  const Page = (TABS.find(([k]) => k === nav.tab) || TABS[0])[2];

  const unread = s.alerts.filter((a) => !a.read).length;

  useEffect(() => {
    document.title = `${
      TABS.find(([k]) => k === nav.tab)?.[1] || "Vestro"
    } · Vestro Bank (simulated)`;
  }, [nav.tab]);

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo">V</span>
          <b>Vestro</b>
          <span className="tag">SIMULATED</span>

          <span className="muted hide-sm">
            Fictional bank · data as of {fmtDate(localToday())}
          </span>
        </div>

        <div className="who">
          <DemoMenu />

          <button
            className="bell"
            onClick={() => go("activity")}
            aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
          >
            🔔
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>

          <span className="hide-sm">{s.customer.name}</span>
          <span className="chip sm">{s.customer.segment}</span>

          <button className="btn sm" onClick={() => call("logout")}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Main">
        {TABS.map(([k, t]) => (
          <button
            key={k}
            className={nav.tab === k ? "on" : ""}
            aria-current={nav.tab === k ? "page" : undefined}
            onClick={() => go(k)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main key={nav.tab}>
        <Page />
      </main>

      <footer className="foot">
        Vestro Bank is a fictional institution for demonstration.
        No real money, accounts or personal data are used.
        Not a financial product.
      </footer>
    </>
  );
}

// --------------------------------------------------
// STAFF ACCOUNTS
// --------------------------------------------------

const STAFF_USERS = [
  {
    username: "priya.nair",
    name: "Priya Nair",
    role: "Branch Manager",
    branch: "Mumbai Fort",
    password: "vestro-demo"
  },
  {
    username: "rohit.menon",
    name: "Rohit Menon",
    role: "Branch Manager",
    branch: "Bengaluru MG Road",
    password: "vestro-demo"
  },
  {
    username: "meera.kapoor",
    name: "Meera Kapoor",
    role: "Regional Head",
    branch: "Regional Office",
    password: "vestro-demo"
  }
];

// --------------------------------------------------
// INSTITUTION STAFF LOGIN
// --------------------------------------------------

function StaffLogin({ onLogin, onBack }) {
  const [selectedStaff, setSelectedStaff] = useState("priya.nair");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = STAFF_USERS.find(
    (staff) => staff.username === selectedStaff
  );

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      if (!selected) {
        throw new Error("Please select a staff profile.");
      }

      const result = await api.login(
        selected.username,
        selected.password
      );

      if (!result?.token || !result?.user) {
        throw new Error("Invalid login response from server.");
      }

      if (!result.user.role || result.user.role === "customer") {
        throw new Error("Institution staff access required.");
      }

      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ic">
      <div
        style={{
          minHeight: "85vh",
          display: "grid",
          placeItems: "center",
          padding: 24
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            maxWidth: 500,
            padding: 32,
            border: "1px solid #29434b",
            borderRadius: 16,
            background: "#14272d"
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 800 }}>
            <span style={{ color: "#e8a33b" }}>V</span>estro Bank
          </div>

          <p style={{ color: "#9bb4bd" }}>
            Institution console · Staff access
          </p>

          <h2>Choose your staff profile</h2>

          {error && (
            <div className="msg bad" role="alert">
              {error}
            </div>
          )}

          <label htmlFor="staff-profile">
            Select staff member
          </label>

          <select
            id="staff-profile"
            value={selectedStaff}
            onChange={(e) => {
              setSelectedStaff(e.target.value);
              setError("");
            }}
            style={{
              width: "100%",
              padding: 14,
              margin: "10px 0 20px",
              borderRadius: 9,
              border: "1px solid #29434b",
              background: "#10242a",
              color: "#fff",
              fontSize: 15
            }}
          >
            {STAFF_USERS.map((staff) => (
              <option key={staff.username} value={staff.username}>
                {staff.name} — {staff.role}
              </option>
            ))}
          </select>

          {selected && (
            <div
              style={{
                padding: 18,
                marginBottom: 22,
                borderRadius: 10,
                background: "#10242a",
                border: "1px solid #29434b"
              }}
            >
              <div style={{ fontSize: 19, fontWeight: 700 }}>
                {selected.name}
              </div>

              <div style={{ color: "#e8a33b", marginTop: 6 }}>
                {selected.role}
              </div>

              <div style={{ color: "#9bb4bd", marginTop: 5 }}>
                {selected.branch}
              </div>

              <div
                style={{
                  color: "#91aab4",
                  fontSize: 12,
                  marginTop: 14
                }}
              >
                User ID: {selected.username}
              </div>

              <div
                style={{
                  color: "#91aab4",
                  fontSize: 12,
                  marginTop: 5
                }}
              >
                Demo password: {selected.password}
              </div>
            </div>
          )}

          <button
            className="btn"
            type="submit"
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading
              ? "Authenticating..."
              : `Continue as ${selected?.name || "Staff"}`}
          </button>

          <button
            type="button"
            className="btn sm ghost"
            onClick={onBack}
            style={{ width: "100%", marginTop: 12 }}
          >
            ← Back to portal selection
          </button>

          <p
            style={{
              color: "#91aab4",
              fontSize: 12,
              marginTop: 24
            }}
          >
            Demonstration staff accounts only. All banking data is synthetic.
          </p>
        </form>
      </div>
    </div>
  );
}

// --------------------------------------------------
// PORTAL SELECTOR
// --------------------------------------------------

function PortalSelector({ onSelect }) {
  return (
    <div
      style={{
        minHeight: "85vh",
        background: "#0b1220",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 30
      }}
    >
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 42, fontWeight: 800 }}>
            <span style={{ color: "#e8a33b" }}>V</span>estro Bank
          </div>

          <p style={{ color: "#94a3b8" }}>
            Select your banking environment
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24
          }}
        >
          <button
            onClick={() => onSelect("customer")}
            style={{
              textAlign: "left",
              padding: 32,
              borderRadius: 16,
              border: "1px solid #334b6b",
              background: "#17263c",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 16 }}>👤</div>

            <h2>Customer Banking</h2>

            <p style={{ color: "#a9b9ce", lineHeight: 1.6 }}>
              Access personal accounts, payments, cards, deposits,
              loans and transaction history.
            </p>

            <strong>Enter customer banking →</strong>
          </button>

          <button
            onClick={() => onSelect("institution")}
            style={{
              textAlign: "left",
              padding: 32,
              borderRadius: 16,
              border: "1px solid #17616d",
              background: "#142d36",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 16 }}>🏦</div>

            <h2>Institution Console</h2>

            <p style={{ color: "#a9b9ce", lineHeight: 1.6 }}>
              Manage banking operations, risk monitoring, approvals,
              branches, payment policies and accounts.
            </p>

            <strong>Enter institution console →</strong>
          </button>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 36,
            color: "#718096",
            fontSize: 12
          }}
        >
          Simulated demonstration environment · Synthetic data only
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------
// APPLICATION GATE
// --------------------------------------------------

function Gate() {
  const { state: s } = useBank();

  const [portal, setPortal] = useState("select");
  const [staffAuthenticated, setStaffAuthenticated] = useState(false);

  if (portal === "customer") {
    return (
      <>
        {!s.session?.active && (
          <div
            style={{
              padding: 12,
              background: "#111c30"
            }}
          >
            <button
              className="btn sm ghost"
              onClick={() => setPortal("select")}
            >
              ← Switch portal
            </button>
          </div>
        )}

        {s.session?.active ? <Shell /> : <Login />}
      </>
    );
  }

  if (portal === "institution") {
    if (!staffAuthenticated) {
      return (
        <StaffLogin
          onLogin={() => setStaffAuthenticated(true)}
          onBack={() => setPortal("select")}
        />
      );
    }

    return (
      <InstitutionConsole
        onAuthFailure={() => {
          setToken(null);
          setStaffAuthenticated(false);
          setPortal("select");
        }}
      />
    );
  }

  return <PortalSelector onSelect={setPortal} />;
}

// --------------------------------------------------
// ROOT APPLICATION
// --------------------------------------------------

export default function App() {
  return (
    <BankProvider>
      <div className="sim-banner" role="note">
        Simulated demonstration environment — all data is synthetic — not a real bank
      </div>

      <Gate />

      <OtpModal />
      <Toasts />
    </BankProvider>
  );
}
