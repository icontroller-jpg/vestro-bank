
import React, { useEffect, useRef, useState } from "react";

import { BankProvider, bank, useBank } from "./api.js";
import { api, setToken } from "./consoleApi.js";
import { customerApi, hasCustomerToken, setCustomerToken } from "./customerApi.js";

import { fmtDate, fmtDateTime, localToday } from "./engine/index.js";
import OtpModal from "./components/OtpModal.jsx";
import { Card, Page, Switch } from "./components/ui.jsx";

import { Login, Overview } from "./pages.jsx";

import InstitutionConsole from "./InstitutionConsole.jsx";

// --------------------------------------------------
// CUSTOMER NAVIGATION
// --------------------------------------------------

const CUSTOMER_NAV = [
  ["overview", "Overview"],
  ["accounts", "Accounts"],
  ["transactions", "Transactions"]
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

function formatPaise(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0) / 100);
}

function Shell({ onSignOut }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("overview");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const data = await customerApi.dashboard();
        if (mounted) setDashboard(data);
      } catch (err) {
        if (!mounted) return;

        if (!hasCustomerToken()) {
          onSignOut();
          return;
        }

        setError(err.message || "Unable to load your dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [onSignOut]);

  const customer = dashboard?.customer || {};
  const pageTitle = {
    overview: "Overview",
    accounts: "Accounts",
    transactions: "Transactions"
  }[activePage] || "Overview";

  useEffect(() => {
    document.title = `${pageTitle} · Vestro Bank`;
  }, [pageTitle]);

  function signOut() {
    setCustomerToken(null);
    onSignOut();
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo">V</span>
          <b>Vestro</b>
          <span className="tag">SIMULATED</span>
          <span className="muted hide-sm">
            Customer banking · Synthetic data
          </span>
        </div>

        <div className="who">
          {customer.name && (
            <span className="hide-sm">{customer.name}</span>
          )}

          {customer.segment && (
            <span className="chip sm">{customer.segment}</span>
          )}

          <button className="btn sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav
        aria-label="Customer banking navigation"
        style={{
          display: "flex",
          gap: 8,
          padding: "14px 24px",
          overflowX: "auto",
          borderBottom: "1px solid #29434b"
        }}
      >
        {CUSTOMER_NAV.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn sm ${activePage === key ? "primary" : "ghost"}`}
            aria-current={activePage === key ? "page" : undefined}
            onClick={() => setActivePage(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {loading ? (
          <div className="pad">
            <p className="muted">Loading your Vestro accounts…</p>
          </div>
        ) : error ? (
          <div className="pad">
            <div className="err" role="alert">{error}</div>
            <button
              className="btn sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {activePage === "overview" && (
              <Overview dashboard={dashboard} />
            )}

            {activePage === "accounts" && (
              <CustomerAccounts dashboard={dashboard} />
            )}

            {activePage === "transactions" && (
              <CustomerTransactions dashboard={dashboard} />
            )}
          </>
        )}
      </main>

      <footer className="foot">
        Vestro Bank is a fictional institution for demonstration.
        All account and transaction data is synthetic. Not a financial product.
      </footer>
    </>
  );
}

function CustomerAccounts({ dashboard }) {
  const accounts = dashboard?.accounts || [];

  return (
    <Page
      title="Your accounts"
      sub="View your account details, available balances and account status."
    >
      {!accounts.length ? (
        <Card title="Accounts">
          <p className="muted">No customer accounts were found.</p>
        </Card>
      ) : (
        <div className="grid cols-2">
          {accounts.map((account) => (
            <Card
              key={account.code}
              title={`Account ${account.code}`}
              sub={account.masked || "Masked account number"}
            >
              <div className="muted small">Current balance</div>
              <div className="big">
                {formatPaise(account.balance_paise)}
              </div>

              <div className="ctl-row">
                <span className="muted">Account status</span>
                <b>{account.status}</b>
              </div>

              <div className="ctl-row">
                <span className="muted">Bank freeze status</span>
                <b>{account.bank_frozen ? "Frozen" : "Not frozen"}</b>
              </div>

              {account.bank_frozen && account.freeze_reason && (
                <p className="muted small">
                  Reason: {account.freeze_reason}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

function CustomerTransactions({ dashboard }) {
  const transactions = dashboard?.transactions || [];

  return (
    <Page
      title="Transaction history"
      sub="Your latest 50 transactions recorded by Vestro Bank."
    >
      <Card title="Recent transactions" flush>
        {!transactions.length ? (
          <div className="pad">
            <p className="muted">No transactions found.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Payment details</th>
                  <th>Rail</th>
                  <th>Status</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.ref}>
                    <td className="nowrap">
                      {fmtDateTime(tx.created_at)}
                    </td>
                    <td>{tx.ref}</td>
                    <td>
                      {tx.beneficiary || "Account transaction"}

                      {(tx.from_account || tx.to_account) && (
                        <div className="muted small">
                          {tx.from_account || "—"}
                          {" → "}
                          {tx.to_account || "—"}
                        </div>
                      )}

                      {tx.failure_reason && (
                        <div className="muted small">
                          {tx.failure_reason}
                        </div>
                      )}
                    </td>
                    <td>{tx.rail}</td>
                    <td>{tx.status}</td>
                    <td className="r nowrap">
                      {formatPaise(tx.amount_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
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
  const [portal, setPortal] = useState(hasCustomerToken() ? "customer" : "select");
  const [customerAuthenticated, setCustomerAuthenticated] = useState(hasCustomerToken());
  const [staffAuthenticated, setStaffAuthenticated] = useState(false);

  function customerSignOut() {
    setCustomerToken(null);
    setCustomerAuthenticated(false);
    setPortal("customer");
  }

  if (portal === "customer") {
    return (
      <>
        {!customerAuthenticated && (
          <div style={{ padding: 12, background: "#111c30" }}>
            <button className="btn sm ghost" onClick={() => setPortal("select")}>
              ← Switch portal
            </button>
          </div>
        )}

        {customerAuthenticated ? (
          <Shell onSignOut={customerSignOut} />
        ) : (
          <Login
            onCustomerDone={() => setCustomerAuthenticated(true)}
            onStaffDone={() => {
              setStaffAuthenticated(true);
              setPortal("institution");
            }}
          />
        )}
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
