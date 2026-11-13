import React, { useState } from "react";
import { api, setToken } from "../consoleApi.js";
import { customerApi, setCustomerToken } from "../customerApi.js";

const STAFF_DEMO_USERS = [
  {
    username: "priya.nair",
    password: "vestro-demo",
    role: "Branch manager",
  },
  {
    username: "rohit.menon",
    password: "vestro-demo",
    role: "Branch manager",
  },
  {
    username: "meera.kapoor",
    password: "vestro-demo",
    role: "Regional head",
  },
];

export default function Login({ onCustomerDone, onStaffDone }) {
  const [portal, setPortal] = useState("customer");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  function changePortal(next) {
    setPortal(next);
    setUser("");
    setPw("");
    setError("");
  }

  function selectDemo(username) {
    const selected = STAFF_DEMO_USERS.find(
      (item) => item.username === username
    );

    setUser(selected?.username || "");
    setPw(selected?.password || "");
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!user.trim() || !pw) {
      setError("Enter your user ID and password.");
      return;
    }

    setLoading(true);

    try {
      if (portal === "customer") {
        const result = await customerApi.login(user.trim(), pw);

        if (!result?.token || !result?.customer) {
          throw new Error("Invalid customer login response from server.");
        }

        setCustomerToken(result.token);
        await onCustomerDone?.(result.customer);
      } else {
        const result = await api.login(user.trim(), pw);

        if (!result?.token || !result?.user) {
          throw new Error("Invalid login response from server.");
        }

        if (!result.user.role || result.user.role === "customer") {
          throw new Error("Institution staff access required.");
        }

        setToken(result.token);
        await onStaffDone?.(result.user);
      }
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo">V</span>
          <div>
            <h1>Vestro Bank</h1>
            <p>Secure digital banking</p>
          </div>
        </div>

        <h2>Welcome back</h2>
        <p>Select your banking portal.</p>

        <div className="portal-options">
          <button
            type="button"
            className={portal === "customer" ? "selected" : ""}
            onClick={() => changePortal("customer")}
          >
            <strong>Customer Banking</strong>
            <small>Personal accounts and transaction history</small>
          </button>

          <button
            type="button"
            className={portal === "staff" ? "selected" : ""}
            onClick={() => changePortal("staff")}
          >
            <strong>Institution Console</strong>
            <small>Staff operations, approvals and controls</small>
          </button>
        </div>

        {portal === "staff" && (
          <div className="field">
            <label htmlFor="demo-account">Select a staff demo account</label>
            <select
              id="demo-account"
              value={user}
              onChange={(e) => selectDemo(e.target.value)}
            >
              <option value="">Choose an account</option>
              {STAFF_DEMO_USERS.map((item) => (
                <option key={item.username} value={item.username}>
                  {item.username} — {item.role}
                </option>
              ))}
            </select>
            <div className="hint">
              Select a staff demo account to fill its credentials.
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="login-user">User ID</label>
          <input
            id="login-user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <div className="pw">
            <input
              id="login-password"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="btn sm"
              onClick={() => setShow(!show)}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}

        <button
          className="btn primary block"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Continue"}
        </button>

        <p className="muted small">
          {portal === "customer"
            ? "Customer credentials are verified by the Vestro banking server."
            : "Restricted access for authorised bank personnel."}
        </p>
      </form>
    </div>
  );
}
