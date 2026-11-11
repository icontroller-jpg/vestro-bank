import React, { useEffect, useRef, useState } from "react";
import { useBank } from "../api.js";
import { MAX_ATTEMPTS, RESEND_AFTER_MS } from "../engine/index.js";
import { Modal } from "./ui.jsx";

const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Step-up verification. The challenge lives in the engine; this only collects the code. */
export default function OtpModal() {
  const { state, otp, closeOtp, call } = useBank();
  const [code, setCode] = useState(""), [msg, setMsg] = useState(""), [closed, setClosed] = useState(null), [tick, setTick] = useState(0), [busy, setBusy] = useState(false); void tick;
  const input = useRef(null);
  const ch = otp ? state.challenges.find((c) => c.id === otp.id) : null;
  const sms = otp ? state.sms.find((m) => m.challenge === otp.id) : null;
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 500); return () => clearInterval(t); }, []);
  useEffect(() => { setCode(""); setMsg(""); setClosed(null); }, [otp?.id]);
  if (!otp || !ch) return null;

  const now = Date.now(), left = Date.parse(ch.expiresAt) - now, sinceSent = now - Date.parse(ch.lastSentAt);
  const pending = ch.status === "PENDING" && !closed && left > 0;
  const expired = ch.status === "EXPIRED" || (ch.status === "PENDING" && left <= 0);
  const wait = Math.max(0, Math.ceil((RESEND_AFTER_MS - sinceSent) / 1000));

  const verify = (e) => {
    e?.preventDefault(); if (code.length !== 6 || busy) return; setBusy(true);
    const r = call("verifyOtp", ch.id, code);
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    const v = r.value;
    if (v.ok) { closeOtp(); otp.onDone?.(v.result); return; }
    setMsg(v.message); setCode(""); input.current?.focus();
    if (v.status !== "PENDING") setClosed(v.status);
  };
  const resend = () => { const r = call("resendOtp", ch.id); if (!r.ok) setMsg(r.error); else { setMsg("A new OTP has been sent."); setCode(""); input.current?.focus(); } };
  const cancel = () => { if (ch.status === "PENDING") call("cancelOtp", ch.id); closeOtp(); };

  return (
    <Modal title="Verify with OTP" onClose={cancel} locked={pending && busy}
      footer={pending
        ? <><button className="btn ghost" onClick={cancel} type="button">Cancel</button><button className="btn primary" disabled={code.length !== 6 || busy} type="submit" form="otp-form">Verify &amp; continue</button></>
        : <button className="btn primary" onClick={closeOtp} type="button">Close</button>}>
      <p className="otp-for">You are <b>{ch.label}</b>.</p>
      {ch.hint && <p className="muted">{ch.hint}</p>}
      {pending ? (
        <form id="otp-form" onSubmit={verify}>
          <label htmlFor="otp-code">Enter the 6-digit OTP sent to {state.customer.mobile}</label>
          <input id="otp-code" ref={input} className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setMsg(""); }} aria-describedby="otp-msg" placeholder="••••••" />
          <div id="otp-msg" className={msg && !/new OTP/.test(msg) ? "err" : "hint"} role="status">{msg || `Expires in ${mmss(left)} · ${ch.attempts === 0 ? MAX_ATTEMPTS : MAX_ATTEMPTS - ch.attempts} attempts left`}</div>
          <div className="otp-links">
            <button type="button" className="link" onClick={resend} disabled={wait > 0 || ch.resends >= 3}>{wait > 0 ? `Resend OTP in ${wait}s` : "Resend OTP"}</button>
            <span className="muted">Never share your OTP with anyone, including bank staff.</span>
          </div>
        </form>
      ) : (
        <div className="notice bad" role="alert"><div><b>{ch.status === "LOCKED" || closed === "LOCKED" ? "Verification locked" : expired ? "OTP expired" : "Request closed"}</b>
          <div className="notice-body">{msg || (expired ? "The OTP expired. Please start the action again." : "This request is no longer active.")} Nothing has been changed on your account.</div></div></div>
      )}
      {sms && (
        <div className="sms" aria-label="Simulated SMS">
          <div className="sms-tag">Demo only · simulated SMS</div>
          <div className="sms-text">{sms.text}</div>
        </div>
      )}
    </Modal>
  );
}
