import React, { useState } from "react";
import { useBank } from "../api.js";
import { PRODUCTS, assessLoan, dayDiff, dueNow, fmtDate, inr, inr0, localToday, mask, nextDue, outstanding, parseAmount, prepayQuote } from "../engine/index.js";
import { AmountField, Bar, Card, Empty, Field, KV, Modal, Notice, Page, Pill, Segmented, Select, Stat, StatusPill } from "../components/ui.jsx";

const tenor = (m) => (m % 12 === 0 ? `${m / 12} years` : `${m} months`);

export default function Loans() {
  const { state: s, call, toast, openOtp } = useBank();
  const [view, setView] = useState("mine");
  const active = s.loans.filter((l) => l.status === "ACTIVE");
  return (
    <Page title="Loans" sub="Your loans, repayments and new applications"
      actions={<Segmented label="Loan views" value={view} onChange={setView} options={[["mine", "My loans"], ["apply", "Apply for a loan"]]} />}>
      {view === "mine" ? <>
        <div className="grid stats">
          <Stat label="Outstanding" value={inr0(active.reduce((a, l) => a + outstanding(l), 0))} sub={`${active.length} active loan${active.length === 1 ? "" : "s"}`} />
          <Stat label="Monthly EMIs" value={inr0(active.reduce((a, l) => a + l.emi, 0))} sub={`${Math.round((active.reduce((a, l) => a + l.emi, 0) / s.customer.monthlyIncome) * 100)}% of your monthly income`} />
          <Stat label="Credit score" value={s.customer.creditScore} sub="Excellent · simulated" tone="good" />
        </div>
        {!s.loans.length && <Empty title="No loans yet">Apply for one in a minute.</Empty>}
        {s.loans.map((l) => <LoanCard key={l.id} l={l} s={s} call={call} toast={toast} openOtp={openOtp} />)}
      </> : <Apply s={s} call={call} toast={toast} openOtp={openOtp} onAccepted={() => setView("mine")} />}
    </Page>
  );
}

function LoanCard({ l, s, call, toast, openOtp }) {
  const [sched, setSched] = useState(false), [prepay, setPrepay] = useState(false), [pay, setPay] = useState(false);
  const out = outstanding(l), paid = l.schedule.filter((r) => r.status === "PAID").length, d = dueNow(l);
  const early = d && !d.overdue && dayDiff(localToday(), d.row.due) > 15;
  return (
    <Card title={`${l.label} · ${l.number}`} sub={`${l.rate}% p.a. · ${tenor(l.months)} · started ${fmtDate(l.start)}`} actions={<StatusPill s={l.status} />}>
      <div className="grid cols-4">
        <div><div className="muted small">Outstanding</div><b className="big">{inr(out)}</b></div><div><div className="muted small">EMI</div><b className="big">{inr(l.emi)}</b></div>
        <div><div className="muted small">Next EMI due</div><b>{d ? fmtDate(d.row.due) : "–"}</b>{d?.overdue && <Pill tone="bad">Overdue {d.days}d</Pill>}</div><div><div className="muted small">Repaid</div><b>{paid} of {l.schedule.length} EMIs</b></div></div>
      <Bar value={paid} max={l.schedule.length} />
      {l.status === "ACTIVE" && <div className="btn-row">
        <button className="btn sm primary" onClick={() => setPay(true)} disabled={early} title={early ? "You can pay up to 15 days before the due date" : ""}>Pay EMI {d ? inr(d.total) : ""}</button>
        <button className="btn sm" onClick={() => setPrepay(true)}>Part-pay or close</button><button className="btn sm ghost" onClick={() => setSched(true)}>Repayment schedule</button></div>}
      {l.status !== "ACTIVE" && <button className="btn sm ghost" onClick={() => setSched(true)}>Repayment schedule</button>}
      {early && <p className="muted small">Your next EMI is due on {fmtDate(d.row.due)}. You can pay it from {fmtDate(new Date(Date.parse(d.row.due) - 15 * 864e5).toISOString())}.</p>}
      {sched && <Modal title={`Schedule · ${l.number}`} wide onClose={() => setSched(false)} footer={<button className="btn primary" onClick={() => setSched(false)}>Close</button>}>
        <div className="tablewrap tall"><table><thead><tr><th>#</th><th>Due</th><th className="r">EMI</th><th className="r">Principal</th><th className="r">Interest</th><th className="r">Balance</th><th>Status</th></tr></thead>
          <tbody>{l.schedule.map((r) => <tr key={r.n} className={nextDue(l)?.n === r.n ? "hl" : ""}><td>{r.n}</td><td className="nowrap">{fmtDate(r.due)}</td><td className="r">{inr(r.emi)}</td><td className="r">{inr(r.principal)}</td><td className="r">{inr(r.interest)}</td><td className="r">{inr(r.balance)}</td><td><StatusPill s={r.status} /></td></tr>)}</tbody></table></div></Modal>}
      {pay && <PayEmi l={l} d={d} s={s} onClose={() => setPay(false)} call={call} toast={toast} />}
      {prepay && <Prepay l={l} s={s} onClose={() => setPrepay(false)} call={call} toast={toast} openOtp={openOtp} />}
    </Card>
  );
}

function AccPick({ s, v, set, id = "lacc" }) {
  return <Field label="From account" htmlFor={id}><Select id={id} value={v} onChange={set} options={s.accounts.map((x) => [x.id, `${x.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(x.number)} · ${inr0(x.balance - x.hold)}`])} /></Field>;
}

function PayEmi({ l, d, s, onClose, call, toast }) {
  const [acc, setAcc] = useState(l.acc), [err, setErr] = useState("");
  const go = () => { const r = call("payEmi", { loanId: l.id, accId: acc }); if (!r.ok) { setErr(r.error); return; } toast("EMI paid. Thank you."); onClose(); };
  return (<Modal title="Pay EMI" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Pay {inr(d.total)}</button></>}>
    <KV items={[["Loan", `${l.label} ${l.number}`], ["Instalment", `${d.row.n} of ${l.schedule.length}`], ["Due date", fmtDate(d.row.due)], ["EMI", inr(d.row.emi)], ...(d.fee ? [["Late fee", inr(d.fee)]] : []), ["Total", <b>{inr(d.total)}</b>]]} />
    <AccPick s={s} v={acc} set={setAcc} />{err && <Notice tone="bad" title={err} />}</Modal>);
}

function Prepay({ l, s, onClose, call, toast, openOtp }) {
  const [acc, setAcc] = useState(l.acc), [amt, setAmt] = useState(""), [err, setErr] = useState("");
  const amount = parseAmount(amt), q = amount ? prepayQuote(l, amount) : null, base = prepayQuote(l, 0);
  const go = (e) => { e.preventDefault(); const r = call("prepayLoan", { loanId: l.id, accId: acc, amount }); if (!r.ok) { setErr(r.error); return; } openOtp(r.value, () => { toast(q.full ? "Loan closed" : "Part-payment received"); onClose(); }); };
  return (<Modal title="Part-pay or close loan" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="pp" disabled={!amount}>Continue to OTP</button></>}>
    <form id="pp" onSubmit={go}>
      <p>Outstanding principal <b>{inr(base.out)}</b>. Enter the full amount to close the loan. Prepayment charge on this loan: <b>{base.pct ? `${base.pct}%` : "none"}</b>.</p>
      <AmountField label="Amount to pay" value={amt} onChange={(v) => { setAmt(v); setErr(""); }} hint={`Minimum ${inr(base.min)}`} />
      <div className="btn-row"><button type="button" className="btn sm" onClick={() => setAmt(String(base.out / 100))}>Pay in full</button></div>
      {q && <div className="quote"><KV items={[["Reduces principal by", inr(q.principalPart)], ["Prepayment charge", inr(q.penalty)], ["Total debit", <b>{inr(q.total)}</b>], ["Result", q.full ? "Loan closed" : "Fewer EMIs, same EMI amount"]]} /></div>}
      <AccPick s={s} v={acc} set={setAcc} id="pacc" />{err && <Notice tone="bad" title={err} />}
    </form></Modal>);
}

function Apply({ s, call, toast, openOtp, onAccepted }) {
  const [product, setProduct] = useState("PERSONAL"), [amt, setAmt] = useState("300000"), [months, setMonths] = useState(36), [acc, setAcc] = useState("ACC-SAV"), [err, setErr] = useState("");
  const p = PRODUCTS[product], amount = parseAmount(amt), m = Math.min(p.maxM, Math.max(p.minM, months));
  const a = amount ? assessLoan(s, { product, amount, months: m }) : null;
  const offers = s.offers;
  const apply = () => { const r = call("applyLoan", { product, amount, months: m }); if (!r.ok) setErr(r.error); else { setErr(""); toast(r.value.status === "OFFERED" ? "You're pre-approved. Review your offer below." : r.value.status === "DECLINED" ? "Application declined" : "Application sent for review"); } };
  const accept = (o) => { const r = call("acceptLoan", { offerId: o.id, accId: acc }); if (!r.ok) { toast(r.error, "err"); return; } openOtp(r.value, () => { toast("Loan disbursed to your account"); onAccepted(); }); };
  const tone = { APPROVED: "good", REFERRED: "warn", DECLINED: "bad" };
  return (
    <div className="grid pay">
      <Card title="Check eligibility and EMI" sub="No impact on your credit score">
        <div className="chips">{Object.entries(PRODUCTS).map(([k, v]) => <button key={k} className={`chip ${k === product ? "on" : ""}`} onClick={() => { setProduct(k); setMonths(Math.min(v.maxM, Math.max(v.minM, months))); setErr(""); }} type="button" aria-pressed={k === product}>{v.label}</button>)}</div>
        <p className="muted small">{p.blurb} · from {p.rate}% p.a. · {inr0(p.min)} to {inr0(p.max)}</p>
        <AmountField label="Loan amount" value={amt} onChange={(v) => { setAmt(v); setErr(""); }} />
        <Field label={`Tenor: ${tenor(m)}`} htmlFor="ten"><input id="ten" type="range" min={p.minM} max={p.maxM} step={p.maxM > 120 ? 12 : 6} value={m} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
        {a && (a.errors.length ? <Notice tone="bad" title="Check your details">{a.errors.map((x) => <div key={x}>{x}</div>)}</Notice> : <>
          <div className="emi-box"><div className="muted small">Your EMI</div><div className="emi">{inr(a.emi)}</div><div className="muted small">{a.rate}% p.a. · {tenor(m)} · total interest {inr0(a.totalInterest)}</div></div>
          <KV items={[["Processing fee", `${inr(a.fee)} + GST ${inr(a.gst)}`], ["Existing EMIs", inr(a.obligations)], ["Total EMIs vs income", `${(a.foir * 100).toFixed(0)}% (limit 50%)`]]} />
          <Bar value={a.foir * 100} max={100} tone={a.foir > 0.5 ? "bad" : ""} />
          <Notice tone={tone[a.decision]} title={a.decision === "APPROVED" ? "You qualify" : a.decision === "REFERRED" ? "Needs review by a credit officer" : "Not eligible at this amount"}>{a.reasons.map((r) => <div key={r}>{r}</div>)}</Notice>
          {a.decision !== "APPROVED" && a.maxEligible >= p.min && <button className="btn sm" onClick={() => setAmt(String(Math.floor(a.maxEligible / 100)))}>Use {inr0(a.maxEligible)}</button>}</>)}
        {err && <Notice tone="bad" title={err} />}
        <div className="form-actions"><button className="btn primary lg" onClick={apply} disabled={!a || a.errors.length > 0 || a.decision === "DECLINED"}>Apply now</button></div>
      </Card>
      <div className="stack">
        <Card title="Your applications">
          {!offers.length ? <p className="muted">No applications yet.</p> : <ul className="rows">{offers.map((o) => (
            <li key={o.id} className="col"><div className="row-between"><b>{PRODUCTS[o.product].label} · {inr0(o.amount)}</b><StatusPill s={o.status} /></div>
              <div className="muted small">{tenor(o.months)} · {o.rate}% · EMI {inr(o.emi)} · applied {fmtDate(o.ts)}</div>
              {o.status === "OFFERED" && <div className="offer"><AccPick s={s} v={acc} set={setAcc} id={`oa${o.id}`} /><p className="small">Offer valid until {fmtDate(o.expiresOn)}. {inr(o.amount)} credited to the account you choose; fee {inr(o.fee + o.gst)} deducted.</p><button className="btn primary sm" onClick={() => accept(o)}>Accept offer</button></div>}
              {o.status === "UNDER_REVIEW" && <p className="small muted">A credit officer will contact you. (Simulated.)</p>}{o.status === "DECLINED" && <p className="small">{o.reasons[0]}</p>}</li>))}</ul>}
        </Card>
      </div>
    </div>
  );
}
