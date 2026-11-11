import React, { useEffect, useMemo, useState } from "react";
import { useBank } from "../api.js";
import { MODES, THRESHOLDS, VPA_RE, fmtDateTime, inr, inr0, mask, parseAmount, quotePayment } from "../engine/index.js";
import { AmountField, Card, Empty, Field, KV, Modal, Notice, Page, Pill, Segmented, Select, StatusPill } from "../components/ui.jsx";

const NEXT = {
  ALLOW: ["good", "Goes through immediately", "Low risk: no OTP needed."],
  OTP: ["info", "We'll ask for an OTP", "A one-time password confirms it's really you."],
  HOLD: ["warn", "This payment will be held", "It looks unusual, so we'll reserve the money and ask you to confirm with an OTP. Nothing leaves your account until you do."],
  BLOCK: ["bad", "This payment will be blocked", "It matches known scam patterns."],
};
const RISK_TEXT = { ALLOW: "Low", OTP: "Medium", HOLD: "High", BLOCK: "Very high" };

export default function Payments() {
  const { state: s, nav } = useBank();
  const [view, setView] = useState(nav.params.view || "pay");
  useEffect(() => { if (nav.params.view) setView(nav.params.view); }, [nav]);
  const open = s.payments.filter((p) => ["HELD", "PENDING_OTP"].includes(p.status)).length;
  return (
    <Page title="Payments" sub="Send money by UPI, IMPS, NEFT or RTGS, or move it between your own accounts"
      actions={<Segmented label="Payments views" value={view} onChange={setView} options={[["pay", "Pay"], ["payees", "Payees"], ["history", open ? `History (${open} open)` : "History"]]} />}>
      {view === "pay" && <PayForm />}
      {view === "payees" && <Payees />}
      {view === "history" && <History />}
    </Page>
  );
}

/* ───────────────────────── pay ───────────────────────── */
function PayForm() {
  const { state: s, call, openOtp } = useBank();
  const [from, setFrom] = useState("ACC-SAV"), [payee, setPayee] = useState(`ben:${s.beneficiaries[0]?.id}`), [vpa, setVpa] = useState(""), [mode, setMode] = useState("UPI"), [amt, setAmt] = useState(""), [remark, setRemark] = useState("");
  const [review, setReview] = useState(false), [err, setErr] = useState(""), [resultId, setResultId] = useState(null);

  const ownTargets = s.accounts.filter((a) => a.id !== from);
  const kind = payee === "vpa" ? "UPI" : payee.startsWith("own:") ? "OWN" : s.beneficiaries.find((b) => `ben:${b.id}` === payee)?.kind === "UPI" ? "UPI" : "ACCOUNT";
  const modes = kind === "OWN" ? ["OWN"] : kind === "UPI" ? ["UPI"] : ["IMPS", "NEFT", "RTGS"];
  const useMode = modes.includes(mode) ? mode : modes[0];
  const to = payee === "vpa" ? { type: "VPA", vpa } : payee.startsWith("own:") ? { type: "OWN", accId: payee.slice(4) } : { type: "BENEFICIARY", id: payee.slice(4) };
  useEffect(() => { if (payee.startsWith("own:") && !ownTargets.find((a) => `own:${a.id}` === payee)) setPayee(ownTargets[0] ? `own:${ownTargets[0].id}` : "vpa"); }, [from]); // eslint-disable-line

  const amount = parseAmount(amt);
  const draft = { from, to, mode: useMode, amount: amount || 0, remark };
  const quote = useMemo(() => (amount ? quotePayment(s, draft) : null), [s, from, payee, vpa, useMode, amt]); // eslint-disable-line
  const vpaBad = payee === "vpa" && vpa && !VPA_RE.test(vpa);
  const blockers = [...(amt && !amount ? ["Enter a valid amount, for example 2,500 or 2500.50"] : []), ...(quote?.errors || [])];

  const submit = () => {
    setErr(""); const r = call("initiatePayment", draft);
    if (!r.ok) { setErr(r.error); setReview(false); return; }
    setReview(false); setResultId(r.value.payment.id);
    if (r.value.challenge) openOtp(r.value.challenge, () => { setAmt(""); setRemark(""); });
    else { setAmt(""); setRemark(""); }
  };
  const result = resultId ? s.payments.find((p) => p.id === resultId) : null;
  const fromAcc = s.accounts.find((a) => a.id === from);

  return (
    <div className="grid pay">
      <Card title="New payment">
        {result && <ResultPanel p={result} onClose={() => setResultId(null)} />}
        <form onSubmit={(e) => { e.preventDefault(); if (!blockers.length && amount && !vpaBad && (payee !== "vpa" || VPA_RE.test(vpa))) setReview(true); }} noValidate>
          <Field label="Pay from" htmlFor="from" hint={`Available ${inr(fromAcc.balance - fromAcc.hold)}`}>
            <Select id="from" value={from} onChange={setFrom} options={s.accounts.map((a) => [a.id, `${a.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(a.number)}`])} />
          </Field>
          <Field label="Pay to" htmlFor="to">
            <Select id="to" value={payee} onChange={setPayee} options={[
              ...s.beneficiaries.map((b) => [`ben:${b.id}`, b.kind === "UPI" ? `${b.name} · ${b.vpa}` : `${b.name}${b.nick ? ` (${b.nick})` : ""} · ${mask(b.acct)}`]),
              ...ownTargets.map((a) => [`own:${a.id}`, `My ${a.type === "SAVINGS" ? "Savings" : "Current"} account · ${mask(a.number)}`]), ["vpa", "A new UPI ID…"]]} />
          </Field>
          {payee === "vpa" && <Field label="UPI ID" htmlFor="vpa" error={vpaBad ? "Use the form name@bank, for example ravi@vstb" : ""} hint="You haven't paid this UPI ID before, so it gets extra checks."><input id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value.trim())} placeholder="name@vstb" autoComplete="off" spellCheck="false" /></Field>}
          {modes.length > 1 ? <Field label="Pay using" htmlFor="mode" hint={MODES[useMode].eta}><Select id="mode" value={useMode} onChange={setMode} options={modes.map((m) => [m, `${MODES[m].label}${MODES[m].min > 1 ? ` (min ${inr(MODES[m].min)})` : ""}`])} /></Field>
            : <div className="field"><label>Pay using</label><div className="static">{MODES[useMode].label} <span className="muted">· {MODES[useMode].eta}</span></div></div>}
          <AmountField value={amt} onChange={setAmt} error={amt && !amount ? "Enter a valid amount" : ""} />
          <Field label="Remark (optional)" htmlFor="rm"><input id="rm" value={remark} maxLength={40} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. October rent" /></Field>

          {quote && !blockers.length && (() => { const [tone, head, body] = NEXT[quote.risk.decision]; return (
            <Notice tone={tone} title={head}>{body}
              {quote.risk.reasons.length > 0 && <ul className="why">{quote.risk.reasons.map((r) => <li key={r.code}>{r.text}</li>)}</ul>}
              {quote.info.fee > 0 && <div className="small">Charges: {inr(quote.info.fee)} + GST {inr(quote.info.gst)}</div>}</Notice>); })()}
          {blockers.length > 0 && amt && <Notice tone="bad" title="Can't send yet">{blockers.map((b) => <div key={b}>{b}</div>)}</Notice>}
          {err && <Notice tone="bad" title={err} />}
          <div className="form-actions"><button className="btn primary lg" type="submit" disabled={!amount || blockers.length > 0 || (payee === "vpa" && !VPA_RE.test(vpa))}>Review payment</button></div>
        </form>
      </Card>

      <div className="stack">
        <Card title="Your limits today"><Limits from={from} /></Card>
        <Card title="Stay safe from scams">
          <ul className="tips">
            <li>The bank will never ask for your OTP, PIN or password, on a call or message.</li>
            <li>You never need to enter a PIN to <b>receive</b> money.</li>
            <li>Check the payee's name before you confirm. Fraudsters use look-alike UPI IDs.</li>
            <li>New payees are limited to {inr0(THRESHOLDS.newPayeeCap)} for their first 24 hours.</li>
          </ul>
        </Card>
      </div>

      {review && quote && !quote.errors.length && (
        <Modal title="Review your payment" onClose={() => setReview(false)} footer={<><button className="btn ghost" onClick={() => setReview(false)} type="button">Edit</button><button className="btn primary" onClick={submit} type="button" autoFocus>{quote.risk.decision === "ALLOW" ? "Pay now" : "Confirm & continue"}</button></>}>
          <div className="review-amount">{inr(quote.info.amount)}</div>
          <KV items={[["To", quote.info.payee.label], ["From", `${fromAcc.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(fromAcc.number)}`], ["Via", `${MODES[useMode].label} · ${MODES[useMode].eta}`],
            ...(quote.info.fee ? [["Charges", `${inr(quote.info.fee)} + GST ${inr(quote.info.gst)}`], ["Total debit", inr(quote.info.total)]] : []), ...(remark ? [["Remark", remark]] : []),
            ["Security check", `${RISK_TEXT[quote.risk.decision]} risk · ${NEXT[quote.risk.decision][1].toLowerCase()}`]]} />
          {quote.info.payee.newPayee && <Notice tone="warn" title="First payment to this payee">Make sure you know and trust them. Payments to a wrong account are hard to recover.</Notice>}
        </Modal>
      )}
    </div>
  );
}

function Limits({ from }) {
  const { state: s } = useBank();
  const a = s.accounts.find((x) => x.id === from);
  const today = new Date().toDateString();
  const used = s.payments.filter((p) => p.from === from && p.mode !== "OWN" && ["COMPLETED", "HELD"].includes(p.status) && new Date(p.ts).toDateString() === today).reduce((x, p) => x + p.amount, 0);
  const pctUsed = Math.min(100, (used / a.dailyLimit) * 100);
  return (<><div className="limit-line"><span>{inr(used)} used</span><span className="muted">of {inr(a.dailyLimit)}</span></div><div className="meter"><i className={pctUsed > 85 ? "bad" : ""} style={{ width: `${pctUsed}%` }} /></div>
    <p className="muted small">Per-payment maximums: UPI {inr(MODES.UPI.max)} · IMPS {inr(MODES.IMPS.max)} · NEFT {inr(MODES.NEFT.max)} · RTGS {inr(MODES.RTGS.max)}</p></>);
}

function ResultPanel({ p, onClose }) {
  const { call, openOtp, toast } = useBank();
  const retry = () => { const id = p.challengeId; openOtp(id, () => {}); };
  const confirmHeld = () => { const r = call("confirmHeld", p.id); if (r.ok) openOtp(r.value, () => {}); else toast(r.error, "err"); };
  const cancel = () => { const r = call("cancelPayment", p.id); if (r.ok) toast("Payment cancelled. No money was sent."); else toast(r.error, "err"); };
  const x = { COMPLETED: ["good", `Payment of ${inr(p.amount)} sent`, `To ${p.payee.label}. Reference ${p.utr}.`],
    PENDING_OTP: ["info", "Waiting for your OTP", "Enter the OTP to send this payment. Nothing has left your account yet."],
    HELD: ["warn", "Payment on hold", "We're holding this payment for your safety. Confirm it with an OTP, or cancel it."],
    BLOCKED: ["bad", "Payment blocked", p.failure || "This payment was stopped for your safety."],
    CANCELLED: ["neutral", "Payment cancelled", `${p.failure || "Cancelled"}. No money was sent.`], FAILED: ["bad", "Payment failed", p.failure] }[p.status] || ["info", p.status, ""];
  return (
    <Notice tone={x[0] === "neutral" ? "info" : x[0]} title={x[1]} actions={<button className="link" onClick={onClose} aria-label="Dismiss">Dismiss</button>}>
      {x[2]}
      {p.status === "PENDING_OTP" && <div className="btn-row"><button className="btn sm primary" onClick={retry}>Enter OTP</button><button className="btn sm" onClick={cancel}>Cancel payment</button></div>}
      {p.status === "HELD" && <div className="btn-row"><button className="btn sm primary" onClick={confirmHeld}>Confirm with OTP</button><button className="btn sm" onClick={cancel}>Cancel payment</button></div>}
      {["BLOCKED", "HELD"].includes(p.status) && p.risk.reasons.length > 0 && <ul className="why">{p.risk.reasons.map((r) => <li key={r.code}>{r.text}</li>)}</ul>}
    </Notice>
  );
}

/* ───────────────────────── payees ───────────────────────── */
function Payees() {
  const { state: s, call, openOtp, toast } = useBank();
  const [kind, setKind] = useState("ACCOUNT"), [f, setF] = useState({ name: "", nick: "", acct: "", acct2: "", ifsc: "", vpa: "" }), [err, setErr] = useState(""), [rm, setRm] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(""); };
  const add = (e) => {
    e.preventDefault(); const r = call("addBeneficiary", { ...f, kind: kind === "UPI" ? "UPI" : "ACCOUNT" });
    if (!r.ok) { setErr(r.error); return; }
    openOtp(r.value, () => { setF({ name: "", nick: "", acct: "", acct2: "", ifsc: "", vpa: "" }); toast(`Payee added. New payees have a ${inr0(THRESHOLDS.newPayeeCap)} limit for 24 hours.`); });
  };
  const hoursOld = (b) => (Date.now() - Date.parse(b.addedAt)) / 36e5;
  return (
    <div className="grid pay">
      <Card title="Saved payees" flush>
        {!s.beneficiaries.length ? <div className="pad"><Empty title="No saved payees">Add one to pay faster next time.</Empty></div> :
          <ul className="rows pad">{s.beneficiaries.map((b) => (
            <li key={b.id}><div className="avatar">{b.name[0]}</div><div className="grow"><b>{b.name}</b>{b.nick && <span className="muted"> · {b.nick}</span>}<div className="muted small">{b.kind === "UPI" ? b.vpa : `${mask(b.acct)} · ${b.ifsc} · ${b.bank}`}</div></div>
              {hoursOld(b) < 24 && <Pill tone="warn">New · {inr0(THRESHOLDS.newPayeeCap)} limit</Pill>}<button className="btn sm ghost" onClick={() => setRm(b)}>Remove</button></li>))}</ul>}
      </Card>
      <Card title="Add a payee" sub="An OTP is needed to add someone new">
        <Segmented label="Payee type" value={kind} onChange={(k) => { setKind(k); setErr(""); }} options={[["ACCOUNT", "Bank account"], ["UPI", "UPI ID"]]} />
        <form onSubmit={add} noValidate>
          <Field label="Name" htmlFor="pn"><input id="pn" value={f.name} onChange={set("name")} autoComplete="off" /></Field>
          {kind === "UPI" ? <Field label="UPI ID" htmlFor="pv"><input id="pv" value={f.vpa} onChange={set("vpa")} placeholder="name@vstb" autoComplete="off" spellCheck="false" /></Field> : <>
            <Field label="Account number" htmlFor="pa"><input id="pa" inputMode="numeric" value={f.acct} onChange={set("acct")} autoComplete="off" /></Field>
            <Field label="Confirm account number" htmlFor="pa2"><input id="pa2" inputMode="numeric" value={f.acct2} onChange={set("acct2")} autoComplete="off" onPaste={(e) => e.preventDefault()} /></Field>
            <Field label="IFSC" htmlFor="pi" hint="Example: VSTB0000123"><input id="pi" value={f.ifsc} onChange={(e) => { setF({ ...f, ifsc: e.target.value.toUpperCase() }); setErr(""); }} maxLength={11} autoComplete="off" /></Field></>}
          <Field label="Nickname (optional)" htmlFor="pk"><input id="pk" value={f.nick} onChange={set("nick")} /></Field>
          {err && <Notice tone="bad" title={err} />}
          <button className="btn primary" type="submit">Add payee</button>
        </form>
      </Card>
      {rm && <Modal title="Remove payee?" onClose={() => setRm(null)} footer={<><button className="btn ghost" onClick={() => setRm(null)}>Keep</button><button className="btn danger" onClick={() => { call("removeBeneficiary", rm.id); toast(`${rm.name} removed`); setRm(null); }}>Remove</button></>}><p>{rm.name} will be removed from your saved payees. You can add them again later.</p></Modal>}
    </div>
  );
}

/* ───────────────────────── history ───────────────────────── */
function History() {
  const { state: s, call, openOtp, toast } = useBank();
  const [f, setF] = useState("ALL"), [open, setOpen] = useState(null);
  const list = s.payments.filter((p) => f === "ALL" || (f === "OPEN" ? ["HELD", "PENDING_OTP"].includes(p.status) : p.status === f));
  const confirmHeld = (p) => { const r = call("confirmHeld", p.id); if (r.ok) openOtp(r.value, () => {}); else toast(r.error, "err"); };
  const cancel = (p) => { const r = call("cancelPayment", p.id); toast(r.ok ? "Payment cancelled. No money was sent." : r.error, r.ok ? "ok" : "err"); };
  const sel = open && s.payments.find((p) => p.id === open);
  return (
    <Card title="Payment history" flush actions={<Select value={f} onChange={setF} aria-label="Filter" options={[["ALL", "All"], ["OPEN", "Needs action"], ["COMPLETED", "Completed"], ["HELD", "On hold"], ["BLOCKED", "Blocked"], ["CANCELLED", "Cancelled"]]} />}>
      {!list.length ? <div className="pad"><Empty title="No payments here yet">Payments you make in this session will show up with their status.</Empty></div> : (
        <div className="tablewrap"><table><thead><tr><th>When</th><th>To</th><th>Via</th><th className="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
          {list.map((p) => (<tr key={p.id}><td className="nowrap">{fmtDateTime(p.ts)}</td><td>{p.payee.name}<div className="muted small">{p.payee.label}</div></td><td>{MODES[p.mode].label}</td><td className="r nowrap">{inr(p.amount)}</td><td><StatusPill s={p.status} /></td>
            <td className="r nowrap">{p.status === "HELD" && <><button className="btn sm primary" onClick={() => confirmHeld(p)}>Confirm</button> <button className="btn sm" onClick={() => cancel(p)}>Cancel</button> </>}
              {p.status === "PENDING_OTP" && <><button className="btn sm primary" onClick={() => openOtp(p.challengeId, () => {})}>Enter OTP</button> <button className="btn sm" onClick={() => cancel(p)}>Cancel</button> </>}
              <button className="link" onClick={() => setOpen(p.id)}>Details</button></td></tr>))}</tbody></table></div>)}
      {sel && <Modal title="Payment details" onClose={() => setOpen(null)} footer={<button className="btn primary" onClick={() => setOpen(null)}>Close</button>}>
        <KV items={[["Status", <StatusPill s={sel.status} />], ["Amount", inr(sel.amount)], ["To", sel.payee.label], ["Via", MODES[sel.mode].label], ["Reference", <span className="mono">{sel.utr}</span>], ["Requested", fmtDateTime(sel.ts)], ...(sel.fee ? [["Charges", `${inr(sel.fee)} + GST ${inr(sel.gst)}`]] : []), ...(sel.remark ? [["Remark", sel.remark]] : []), ["Security check", RISK_TEXT[sel.risk.decision] + " risk"]]} />
        {sel.risk.reasons.length > 0 && <><h3>Why we checked</h3><ul className="why">{sel.risk.reasons.map((r) => <li key={r.code}>{r.text}</li>)}</ul></>}
        <h3>Timeline</h3><ul className="timeline">{sel.history.map((h, i) => <li key={i}><span className="muted small">{fmtDateTime(h.ts)}</span> {h.event}</li>)}</ul></Modal>}
    </Card>
  );
}
