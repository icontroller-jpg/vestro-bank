
import React, { useState } from "react";
import { useBank } from "../api.js";
import { api, setToken } from "../consoleApi.js";

const CUSTOMER_DEMO_USERS = [
  {
    username: "aarav.mehta",
    password: "Demo@2026",
    label: "Aarav Mehta — Personal Banking",
  },
];

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

export default function Login({ onStaffDone }) {
  const { call, openOtp, toast } = useBank();

  const [portal, setPortal] = useState("customer");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const demoUsers =
    portal === "customer"
      ? CUSTOMER_DEMO_USERS
      : STAFF_DEMO_USERS;

  function changePortal(next) {
    setPortal(next);
    setUser("");
    setPw("");
    setError("");
  }

  function selectDemo(username) {
    const selected = demoUsers.find(
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
      setError("Select a demo account or enter your credentials.");
      return;
    }

    setLoading(true);

    try {
      if (portal === "customer") {
        const result = call("login", user.trim(), pw);

        if (!result?.ok) {
          throw new Error(result?.error || "Customer login failed.");
        }

        openOtp(result.value, () => toast("Welcome back"));
      } else {
        const result = await api.login(user.trim(), pw);

        if (!result?.token || !result?.user) {
          throw new Error("Invalid login response from server.");
        }

        if (
          !result.user.role ||
          result.user.role === "customer"
        ) {
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
            <small>Personal accounts, transfers and cards</small>
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

        <div className="field">
          <label htmlFor="demo-account">
            Select a demo account
          </label>

          <select
            id="demo-account"
            value={user}
            onChange={(e) => selectDemo(e.target.value)}
          >
            <option value="">Choose an account</option>

            {demoUsers.map((item) => (
              <option key={item.username} value={item.username}>
                {portal === "customer"
                  ? item.label
                  : `${item.username} — ${item.role}`}
              </option>
            ))}
          </select>

          <div className="hint">
            Choose an account to automatically fill its credentials.
          </div>
        </div>

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
            ? "Customer authentication requires OTP verification."
            : "Restricted access for authorised bank personnel."}
        </p>
      </form>
    </div>
  );
}
