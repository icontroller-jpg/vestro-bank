import React, { useState } from "react";
import { useBank } from "../api.js";
import { Field } from "../components/ui.jsx";

export default function Login() {
  const { call, openOtp, toast } = useBank();
  const [user, setUser] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [show, setShow] = useState(false);
  const submit = (e) => {
    e.preventDefault(); setErr("");
    if (!user.trim() || !pw) { setErr("Enter your User ID and password"); return; }
    const r = call("login", user, pw);
    if (!r.ok) { setErr(r.error); return; }
    openOtp(r.value, () => toast("Welcome back, Aarav"));
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand"><span className="logo">V</span><div><h1>Vestro Bank</h1><p>Net banking · simulated demo</p></div></div>
        <Field label="User ID" htmlFor="u"><input id="u" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label="Password" htmlFor="p" error={err}>
          <div className="pw"><input id="p" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" aria-invalid={!!err} />
            <button type="button" className="link" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>
        </Field>
        <button className="btn primary block" type="submit">Continue</button>
        <p className="muted small">We will send an OTP to your registered mobile number to finish signing in.</p>
        <div className="demo-box"><b>Demo credentials</b><div>User ID <code>aarav.mehta</code></div><div>Password <code>Demo@2026</code></div>
          <button type="button" className="link" onClick={() => { setUser("aarav.mehta"); setPw("Demo@2026"); }}>Fill in for me</button></div>
      </form>
    </div>
  );
}
