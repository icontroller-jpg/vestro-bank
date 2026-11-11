import React, { useState } from "react";
import { useBank } from "../api.js";
import { CHANNELS, LIMIT_CAPS, creditAvailable, fmtDate, fmtDateTime, inr, inr0, mask, parseAmount } from "../engine/index.js";
import { AmountField, Bar, Card, Field, KV, Modal, Notice, Page, Select, StatusPill, Switch } from "../components/ui.jsx";

const SHOPS = [["FreshMart Grocers", "Grocery"], ["Skyline Electronics", "Electronics"], ["BlueSky Airlines", "Travel"], ["StreamBox", "Entertainment"], ["Unknown Merchant Ltd", "Other"]];
const LIM = { pos: "In-store limit (per purchase)", online: "Online limit (per purchase)", atm: "ATM withdrawal limit (per day)" };

export default function Cards() {
  const { state: s } = useBank();
  const visible = s.cards.filter((c) => c.status !== "BLOCKED");
  const [sel, setSel] = useState(visible[0]?.id);
  const c = s.cards.find((x) => x.id === sel && x.status !== "BLOCKED") || visible[0];
  return (
    <Page title="Cards" sub="Control how, where and how much your cards can be used">
      <div className="card-strip" role="tablist" aria-label="Your cards">
        {visible.map((x) => <button key={x.id} role="tab" aria-selected={x.id === c?.id} className={`cardbtn ${x.id === c?.id ? "on" : ""}`} onClick={() => setSel(x.id)}><CardArt c={x} /></button>)}
      </div>
      {c ? <CardPanel key={c.id} c={c} onSelect={setSel} /> : <Notice tone="info" title="You have no active cards" />}
      {s.cards.some((x) => x.status === "BLOCKED") && <p className="muted small">Blocked cards: {s.cards.filter((x) => x.status === "BLOCKED").map((x) => `${x.name} ending ${x.last4}`).join(", ")}</p>}
    </Page>
  );
}

function CardArt({ c }) {
  return (
    <div className={`cardart ${c.kind === "CREDIT" ? "credit" : "debit"} ${c.frozen ? "frozen" : ""}`}>
      <div className="ca-top"><b>Vestro</b><span>{c.kind === "CREDIT" ? "CREDIT" : "DEBIT"}</span></div>
      <div className="ca-chip" aria-hidden="true" />
      <div className="ca-num">•••• •••• •••• {c.last4}</div>
      <div className="ca-bot"><span>{c.holder}</span><span>{c.expiry}</span><span>{c.network}</span></div>
      {(c.frozen || c.status === "ISSUED") && <div className="ca-flag">{c.status === "ISSUED" ? "NOT ACTIVATED" : "FROZEN"}</div>}
    </div>
  );
}

function CardPanel({ c, onSelect }) {
  const { state: s, call, toast, openOtp } = useBank();
  const [bill, setBill] = useState(false), [block, setBlock] = useState(false);
  const txns = s.cardTxns.filter((t) => t.card === c.id).slice(0, 12);
  const setChannel = (ch, on) => {
    const r = call("cardSetting", { cardId: c.id, channel: ch, enabled: on }); if (!r.ok) { toast(r.error, "err"); return; }
    if (r.value.applied) toast(`${CHANNELS[ch]} switched off`); else openOtp(r.value.challenge, () => toast(`${CHANNELS[ch]} switched on`));
  };
  const act = () => { const r = call("activateCard", c.id); toast(r.ok ? "Card activated. Set your PIN at any Vestro ATM." : r.error, r.ok ? "ok" : "err"); };
  const freeze = (on) => { call("freezeCard", c.id, on); toast(on ? "Card frozen. New transactions will be declined." : "Card is active again"); };
  const cs = c.statement;

  return (
    <div className="grid pay">
      <div className="stack">
        <Card title={c.name} sub={`${c.kind === "CREDIT" ? "Credit" : "Debit"} card ending ${c.last4} · ${c.network} · valid to ${c.expiry}`} actions={<StatusPill s={c.status} />}>
          {c.status === "ISSUED" ? <Notice tone="warn" title="Activate your new card" actions={<button className="btn primary sm" onClick={act}>Activate</button>}>Your replacement card has arrived. Activate it to start using it.</Notice> : <>
            <div className="ctl-row"><div><b>Freeze card</b><div className="muted small">Instantly stops all new transactions. Unfreeze any time.</div></div><Switch checked={c.frozen} onChange={freeze} label="Freeze card" /></div>
            <h3>Where it can be used</h3>
            {Object.entries(CHANNELS).map(([k, t]) => <div className="ctl-row" key={k}><div><b>{t}</b>{k === "intl" && <div className="muted small">Switch on only while travelling.</div>}</div><Switch checked={!!c.channels[k]} onChange={(on) => setChannel(k, on)} label={t} /></div>)}
            <p className="muted small">Switching a channel off is instant. Switching one on needs an OTP.</p>
            <h3>Spending limits</h3>
            {Object.entries(LIM).map(([k, t]) => <LimitRow key={k} c={c} k={k} label={t} />)}
            <div className="btn-row"><button className="btn danger sm" onClick={() => setBlock(true)}>Report lost / block card</button></div></>}
        </Card>
        <Card title="Recent card activity" flush>
          {!txns.length ? <div className="pad"><p className="muted">No card transactions yet.</p></div> : <div className="tablewrap"><table><thead><tr><th>Date</th><th>Merchant</th><th>Via</th><th className="r">Amount</th></tr></thead>
            <tbody>{txns.map((t) => <tr key={t.id}><td className="nowrap">{fmtDateTime(t.ts)}</td><td>{t.merchant}<div className="muted small">{t.status === "DECLINED" ? <span className="dr">Declined: {t.reason}</span> : t.category}</div></td><td>{t.channel}{t.country !== "IN" ? ` · ${t.country}` : ""}</td>
              <td className={`r nowrap ${t.status === "DECLINED" ? "muted" : t.credit ? "cr" : ""}`}>{t.credit ? "+" : ""}{inr(t.amount)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>

      <div className="stack">
        {c.kind === "CREDIT" && <Card title="Credit card bill">
          <div className="grid cols-2"><div><div className="muted small">Outstanding</div><b className="big">{inr(c.outstanding)}</b></div><div><div className="muted small">Available credit</div><b className="big">{inr(creditAvailable(c))}</b></div></div>
          <Bar value={c.outstanding} max={c.creditLimit} tone={c.outstanding / c.creditLimit > 0.8 ? "bad" : ""} /><div className="muted small">Limit {inr0(c.creditLimit)}</div>
          {cs && <KV items={[["Last statement", inr(cs.amount)], ["Paid so far", inr(cs.paid)], ["Minimum due", inr(Math.max(0, cs.minDue - cs.paid))], ["Due date", fmtDate(cs.dueDate)]]} />}
          <button className="btn primary" onClick={() => setBill(true)} disabled={!c.outstanding}>Pay bill</button>
        </Card>}
        {c.status === "ACTIVE" && <Simulator c={c} />}
      </div>
      {bill && <Bill c={c} s={s} call={call} toast={toast} onClose={() => setBill(false)} />}
      {block && <Modal title="Block this card?" onClose={() => setBlock(false)} footer={<><button className="btn ghost" onClick={() => setBlock(false)}>Keep card</button><button className="btn danger" onClick={() => { const r = call("blockCard", c.id); setBlock(false); if (r.ok) openOtp(r.value, (nc) => { toast("Card blocked. A replacement is on its way."); if (nc?.id) onSelect(nc.id); }); else toast(r.error, "err"); }}>Block permanently</button></>}>
        <p>Card ending <b>{c.last4}</b> will be permanently blocked and we'll issue a replacement. This can't be undone. You will need an OTP to confirm.</p></Modal>}
    </div>
  );
}

function LimitRow({ c, k, label }) {
  const { call, toast, openOtp } = useBank();
  const [v, setV] = useState(String(c.limits[k] / 100)), [err, setErr] = useState("");
  const p = parseAmount(v), dirty = p && p !== c.limits[k];
  const save = (e) => { e.preventDefault(); if (!p) { setErr("Enter a valid amount"); return; } const r = call("cardSetting", { cardId: c.id, limit: k, value: p }); if (!r.ok) { setErr(r.error); return; } setErr(""); if (r.value.applied) toast("Limit lowered"); else openOtp(r.value.challenge, () => toast("Limit raised")); };
  return (<form className="limit-row" onSubmit={save}><AmountField label={label} value={v} onChange={(x) => { setV(x); setErr(""); }} error={err} hint={`Highest allowed ${inr0(LIMIT_CAPS[c.kind][k])}`} /><button className="btn sm" disabled={!dirty} type="submit">Update</button></form>);
}

function Bill({ c, s, call, toast, onClose }) {
  const cs = c.statement, [amt, setAmt] = useState(String(Math.max(0, (cs?.amount || 0) - (cs?.paid || 0)) / 100 || c.outstanding / 100)), [acc, setAcc] = useState("ACC-SAV"), [err, setErr] = useState("");
  const go = (e) => { e.preventDefault(); const r = call("payCardBill", { cardId: c.id, accId: acc, amount: parseAmount(amt) }); if (!r.ok) { setErr(r.error); return; } toast("Card bill paid"); onClose(); };
  return (<Modal title="Pay credit card bill" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="bill">Pay now</button></>}>
    <form id="bill" onSubmit={go}><p>Outstanding <b>{inr(c.outstanding)}</b>{cs ? <> · minimum due <b>{inr(Math.max(0, cs.minDue - cs.paid))}</b></> : null}</p>
      <AmountField label="Amount" value={amt} onChange={(v) => { setAmt(v); setErr(""); }} error={err} />
      <Field label="Pay from" htmlFor="bacc"><Select id="bacc" value={acc} onChange={setAcc} options={s.accounts.map((x) => [x.id, `${x.type === "SAVINGS" ? "Savings" : "Current"} · ${mask(x.number)}`])} /></Field></form></Modal>);
}

function Simulator({ c }) {
  const { call } = useBank();
  const [shop, setShop] = useState(0), [amt, setAmt] = useState("1200"), [ch, setCh] = useState("POS"), [country, setCountry] = useState("IN"), [res, setRes] = useState(null), [err, setErr] = useState("");
  const go = (e) => { e.preventDefault(); const p = parseAmount(amt); if (!p) { setErr("Enter a valid amount"); return; } setErr(""); const r = call("authorise", { cardId: c.id, merchant: SHOPS[shop][0], category: SHOPS[shop][1], amount: p, channel: ch, country }); setRes(r.ok ? r.value : { approved: false, reason: r.error }); };
  return (
    <Card title="Try a purchase" sub="A sandbox to see how your controls behave">
      <form onSubmit={go} noValidate>
        <Field label="Merchant" htmlFor="sm"><Select id="sm" value={String(shop)} onChange={(v) => setShop(Number(v))} options={SHOPS.map((x, i) => [String(i), x[0]])} /></Field>
        <AmountField label="Amount" value={amt} onChange={setAmt} error={err} />
        <div className="grid cols-2"><Field label="How" htmlFor="sh"><Select id="sh" value={ch} onChange={setCh} options={[["POS", "In-store (chip)"], ["TAP", "Contactless tap"], ["ONLINE", "Online"], ["ATM", "ATM withdrawal"]]} /></Field>
          <Field label="Where" htmlFor="sc"><Select id="sc" value={country} onChange={setCountry} options={[["IN", "India"], ["SG", "Singapore"], ["AE", "UAE"], ["US", "United States"]]} /></Field></div>
        <button className="btn" type="submit">Attempt purchase</button>
      </form>
      {res && <Notice tone={res.approved ? "good" : "bad"} title={res.approved ? "Approved" : "Declined"}>{res.approved ? "The purchase went through." : res.reason}</Notice>}
    </Card>
  );
}
