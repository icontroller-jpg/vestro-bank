import React, { useState } from "react";
import { useBank } from "../api.js";
import { FD_MIN, FD_MONTHS, RD_MIN, RD_MONTHS, dayDiff, depositRate, fmtDate, inr, inr0, localToday, mask, parseAmount, prematureValue, quoteFD, quoteRD } from "../engine/index.js";
import { AmountField, Bar, Card, Empty, Field, KV, Modal, Notice, Page, Segmented, Select, Stat, StatusPill } from "../components/ui.jsx";

const tenor = (m) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`);

export default function Deposits() {
  const { state: s, call, toast, openOtp } = useBank();
  const [kind, setKind] = useState("FD"), [acc, setAcc] = useState("ACC-SAV"), [amt, setAmt] = useState(""), [months, setMonths] = useState(12), [err, setErr] = useState(""), [closing, setClosing] = useState(null), [confirm, setConfirm] = useState(false);
  const active = s.deposits.filter((d) => d.status === "ACTIVE"), past = s.deposits.filter((d) => d.status !== "ACTIVE");
  const invested = active.reduce((a, d) => a + (d.kind === "FD" ? d.principal : d.installment * d.paid), 0), atMaturity = active.reduce((a, d) => a + d.maturityValue, 0);
  const amount = parseAmount(amt), months_ = kind === "FD" ? FD_MONTHS : RD_MONTHS, m = months_.includes(months) ? months : months_[1];
  const quote = amount ? (kind === "FD" ? (amount >= FD_MIN ? quoteFD(amount, m) : null) : (amount >= RD_MIN ? quoteRD(amount, m) : null)) : null;
  const a = s.accounts.find((x) => x.id === acc);
  const min = kind === "FD" ? FD_MIN : RD_MIN;
  const problem = amt && !amount ? "Enter a valid amount" : amount && amount < min ? `Minimum is ${inr(min)}` : amount && amount > a.balance - a.hold ? `Insufficient balance. Available ${inr(a.balance - a.hold)}` : "";

  const open = () => {
    const r = kind === "FD" ? call("openFD", { accId: acc, amount, months: m }) : call("openRD", { accId: acc, installment: amount, months: m });
    if (!r.ok) { setErr(r.error); setConfirm(false); return; }
    setConfirm(false); setAmt(""); setErr(""); toast(`${kind === "FD" ? "Fixed" : "Recurring"} deposit opened`);
  };
  const payRd = (d) => { const r = call("payRD", { depId: d.id, accId: d.acc }); toast(r.ok ? "Instalment paid" : r.error, r.ok ? "ok" : "err"); };
  const doClose = () => { const r = call("closeDeposit", closing.id); const c = closing; setClosing(null); if (r.ok) openOtp(r.value, () => toast(`${c.kind} ${c.number} closed`)); else toast(r.error, "err"); };

  return (
    <Page title="Deposits" sub="Fixed and recurring deposits earn a higher rate than your savings account">
      <div className="grid stats">
        <Stat label="Invested" value={inr0(invested)} sub={`${active.length} active deposit${active.length === 1 ? "" : "s"}`} />
        <Stat label="Value at maturity" value={inr0(atMaturity)} sub={`Interest earned by then ${inr0(atMaturity - invested)}`} tone="good" />
        <Stat label="Savings rate" value="3.00%" sub="For comparison" />
      </div>

      <div className="grid pay">
        <div className="stack">
          {!active.length && <Empty title="No active deposits">Open one using the form.</Empty>}
          {active.map((d) => { const pct = Math.min(100, (dayDiff(d.start, localToday()) / Math.max(1, dayDiff(d.start, d.maturityDate))) * 100), daysLeft = dayDiff(localToday(), d.maturityDate); return (
            <Card key={d.id} title={`${d.kind === "FD" ? "Fixed deposit" : "Recurring deposit"} · ${d.number}`} sub={`${d.rate}% p.a. · ${tenor(d.months)}`} actions={<StatusPill s={d.status} />}>
              <div className="grid cols-3"><div><div className="muted small">{d.kind === "FD" ? "Principal" : "Monthly instalment"}</div><b>{inr(d.kind === "FD" ? d.principal : d.installment)}</b></div>
                <div><div className="muted small">Maturity value</div><b>{inr(d.maturityValue)}</b></div><div><div className="muted small">Matures on</div><b>{fmtDate(d.maturityDate)}</b></div></div>
              <Bar value={pct} max={100} /><div className="limit-line small"><span className="muted">Opened {fmtDate(d.start)}</span><span className="muted">{daysLeft > 0 ? `${daysLeft} days to go` : "Matures today"}</span></div>
              {d.kind === "RD" && <p className="small">{d.paid} of {d.months} instalments paid{d.nextDue && d.paid < d.months ? ` · next due ${fmtDate(d.nextDue)}` : ""}</p>}
              <div className="btn-row">{d.kind === "RD" && d.paid < d.months && <button className="btn sm primary" onClick={() => payRd(d)}>Pay instalment {inr(d.installment)}</button>}<button className="btn sm" onClick={() => setClosing(d)}>Close early</button></div>
            </Card>); })}
          {past.length > 0 && <Card title="Closed & matured" flush><div className="tablewrap"><table><thead><tr><th>Deposit</th><th>Closed</th><th className="r">Paid out</th><th>Status</th></tr></thead><tbody>{past.map((d) => <tr key={d.id}><td>{d.kind} {d.number}</td><td>{fmtDate(d.closedOn)}</td><td className="r">{inr(d.closedValue)}</td><td><StatusPill s={d.status} /></td></tr>)}</tbody></table></div></Card>}
        </div>

        <div className="stack">
          <Card title="Open a deposit">
            <Segmented label="Deposit type" value={kind} onChange={(k) => { setKind(k); setErr(""); setAmt(""); }} options={[["FD", "Fixed deposit"], ["RD", "Recurring deposit"]]} />
            <form onSubmit={(e) => { e.preventDefault(); if (amount && !problem) setConfirm(true); }} noValidate>
              <Field label="Pay from" htmlFor="da"><Select id="da" value={acc} onChange={setAcc} options={s.accounts.map((x) => [x.id, `${x.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(x.number)} · ${inr0(x.balance - x.hold)}`])} /></Field>
              <AmountField label={kind === "FD" ? "Amount to deposit" : "Monthly instalment"} value={amt} onChange={(v) => { setAmt(v); setErr(""); }} error={problem} hint={`Minimum ${inr(min)}`} />
              <Field label="Tenor" htmlFor="dm"><Select id="dm" value={String(m)} onChange={(v) => setMonths(Number(v))} options={months_.map((x) => [String(x), `${tenor(x)} · ${depositRate(x)}% p.a.`])} /></Field>
              {quote && <div className="quote"><KV items={[["Interest rate", `${quote.rate}% p.a.`], ...(kind === "RD" ? [["You deposit", inr(quote.deposited)]] : []), ["Interest earned", inr(quote.interest)], ["You get at maturity", <b>{inr(quote.maturity)}</b>]]} /><p className="muted small">Interest compounds quarterly. Rates are illustrative.</p></div>}
              {err && <Notice tone="bad" title={err} />}
              <button className="btn primary" type="submit" disabled={!amount || !!problem}>Review &amp; open</button>
            </form>
          </Card>
          <Card title="Today's rates"><table className="mini"><thead><tr><th>Tenor</th><th className="r">Rate p.a.</th></tr></thead><tbody>{FD_MONTHS.map((x) => <tr key={x}><td>{tenor(x)}</td><td className="r">{depositRate(x)}%</td></tr>)}</tbody></table></Card>
        </div>
      </div>

      {confirm && quote && <Modal title={`Open ${kind === "FD" ? "fixed" : "recurring"} deposit`} onClose={() => setConfirm(false)} footer={<><button className="btn ghost" onClick={() => setConfirm(false)}>Back</button><button className="btn primary" onClick={open}>Confirm</button></>}>
        <KV items={[[kind === "FD" ? "Amount" : "Monthly instalment", inr(amount)], ["Tenor", tenor(m)], ["Rate", `${quote.rate}% p.a.`], ["Maturity value", inr(quote.maturity)], ["Debited from", `${a.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(a.number)}`]]} />
        {kind === "RD" && <Notice tone="info" title="First instalment is debited today">Later instalments are paid manually from this page. Missing one reduces your return.</Notice>}</Modal>}
      {closing && (() => { const pv = prematureValue(closing); return <Modal title="Close deposit early?" onClose={() => setClosing(null)} footer={<><button className="btn ghost" onClick={() => setClosing(null)}>Keep it</button><button className="btn danger" onClick={doClose}>Continue to OTP</button></>}>
        <Notice tone="warn" title="You will earn less than planned">Closing before maturity lowers the interest rate by 1%.</Notice>
        <KV items={[["Deposit", `${closing.kind} ${closing.number}`], ["You receive today", <b>{inr(pv.value)}</b>], ["At maturity you'd get", inr(closing.maturityValue)], ["You give up", inr(closing.maturityValue - pv.value)]]} /></Modal>; })()}
    </Page>
  );
}
