import React, { useMemo, useState } from "react";
import { useBank } from "../api.js";
import { fmtDate, inr, inr0, mask, parseAmount } from "../engine/index.js";
import { AmountField, Card, Field, Modal, Page, Pill, Select, download } from "../components/ui.jsx";

const PAGE = 40;
const MODE = { UPI: "UPI", NEFT: "NEFT", IMPS: "IMPS", RTGS: "RTGS", CARD: "Card", LOAN: "Loan", DEPOSIT: "Deposit", FEE: "Charges", BBPS: "Bills", INT: "Interest", CASH: "Cash", TAX: "Tax", OWN: "Own transfer" };

export default function Accounts() {
  const { state: s, call, toast, openOtp, nav } = useBank();
  const [sel, setSel] = useState(nav.params.accId || "ACC-SAV"), [range, setRange] = useState("90"), [kind, setKind] = useState("ALL"), [q, setQ] = useState(""), [page, setPage] = useState(0), [reveal, setReveal] = useState(false), [limitOpen, setLimitOpen] = useState(false);
  const a = s.accounts.find((x) => x.id === sel);
  const rows = useMemo(() => {
    const cutoff = range === "ALL" ? 0 : Date.now() - Number(range) * 864e5, needle = q.trim().toLowerCase();
    return s.txns.filter((t) => t.acc === sel && Date.parse(t.ts) >= cutoff && (kind === "ALL" || t.kind === kind) && (!needle || (t.desc + t.ref + (t.amount / 100)).toLowerCase().includes(needle))).sort((x, y) => y.ts.localeCompare(x.ts) || y.id.localeCompare(x.id));
  }, [s.txns, sel, range, kind, q]);
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);
  const cr = rows.filter((t) => t.kind === "CR").reduce((x, t) => x + t.amount, 0), dr = rows.filter((t) => t.kind === "DR").reduce((x, t) => x + t.amount, 0);
  const csv = () => download(`statement-${a.number.slice(-4)}-${new Date().toISOString().slice(0, 10)}.csv`, ["Date,Description,Reference,Debit,Credit,Balance", ...rows.map((t) => [new Date(t.ts).toISOString().slice(0, 10), `"${t.desc.replace(/"/g, '""')}"`, t.ref || "", t.kind === "DR" ? t.amount / 100 : "", t.kind === "CR" ? t.amount / 100 : "", t.bal / 100].join(","))].join("\n"));
  const reset = (f) => (v) => { f(v); setPage(0); };

  return (
    <Page title="Accounts" sub="Balances, statements and limits">
      <div className="grid cols-2">
        {s.accounts.map((x) => (
          <button key={x.id} className={`acct ${x.id === sel ? "on" : ""}`} onClick={() => { setSel(x.id); setPage(0); }} aria-pressed={x.id === sel}>
            <span className="acct-type">{x.type === "SAVINGS" ? "Savings account" : "Current account"}</span><span className="acct-no">{mask(x.number)}</span>
            <span className="acct-bal">{inr(x.balance)}</span><span className="acct-sub">{x.hold ? `${inr(x.balance - x.hold)} available · ${inr(x.hold)} on hold` : "Available balance"}</span>
          </button>))}
      </div>

      <Card title="Account details" actions={<button className="link" onClick={() => setReveal(!reveal)}>{reveal ? "Hide number" : "Show full number"}</button>}>
        <dl className="kv cols">
          <dt>Account number</dt><dd className="mono">{reveal ? a.number : mask(a.number)}</dd><dt>IFSC</dt><dd className="mono">{a.ifsc}</dd><dt>Branch</dt><dd>{a.branch}</dd>
          <dt>Status</dt><dd><Pill tone="good">Active</Pill></dd><dt>Interest rate</dt><dd>{a.rate ? `${a.rate}% p.a.` : "Not applicable"}</dd>
          <dt>Daily payment limit</dt><dd>{inr0(a.dailyLimit)} <button className="link" onClick={() => setLimitOpen(true)}>Change</button></dd>
        </dl>
      </Card>

      <Card title="Statement" flush
        actions={<button className="btn sm" onClick={csv} disabled={!rows.length}>Download CSV</button>}>
        <div className="filters pad">
          <Field label="Period" htmlFor="rg"><Select id="rg" value={range} onChange={reset(setRange)} options={[["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["ALL", "All"]]} /></Field>
          <Field label="Type" htmlFor="kd"><Select id="kd" value={kind} onChange={reset(setKind)} options={[["ALL", "All"], ["CR", "Money in"], ["DR", "Money out"]]} /></Field>
          <Field label="Search" htmlFor="qq"><input id="qq" type="search" placeholder="Name, reference or amount" value={q} onChange={(e) => reset(setQ)(e.target.value)} /></Field>
        </div>
        <div className="summary-row"><span>{rows.length} transactions</span><span className="cr">In {inr(cr)}</span><span className="dr">Out {inr(dr)}</span></div>
        {!rows.length ? <div className="pad"><p className="muted">No transactions match these filters.</p></div> : (
          <div className="tablewrap"><table><thead><tr><th>Date</th><th>Description</th><th>Via</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
            <tbody>{shown.map((t) => (<tr key={t.id}><td className="nowrap">{fmtDate(t.ts)}<div className="muted small">{new Date(t.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div></td>
              <td>{t.desc}{t.ref && <div className="muted small mono">{t.ref}</div>}</td><td><Pill>{MODE[t.mode] || t.mode}</Pill></td>
              <td className="r dr nowrap">{t.kind === "DR" ? inr(t.amount) : ""}</td><td className="r cr nowrap">{t.kind === "CR" ? inr(t.amount) : ""}</td><td className="r nowrap">{inr(t.bal)}</td></tr>))}</tbody></table></div>)}
        {rows.length > PAGE && <div className="pager"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button><span className="muted">{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}</span><button className="btn sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Older →</button></div>}
      </Card>
      {limitOpen && <LimitModal a={a} onClose={() => setLimitOpen(false)} call={call} toast={toast} openOtp={openOtp} />}
    </Page>
  );
}

function LimitModal({ a, onClose, call, toast, openOtp }) {
  const [v, setV] = useState(String(a.dailyLimit / 100)), [err, setErr] = useState("");
  const save = (e) => {
    e.preventDefault(); const p = parseAmount(v); if (!p) { setErr("Enter a valid amount"); return; }
    const r = call("setDailyLimit", { accId: a.id, value: p }); if (!r.ok) { setErr(r.error); return; }
    if (r.value.applied) { toast("Daily limit lowered"); onClose(); } else openOtp(r.value.challenge, () => { toast("Daily limit raised"); onClose(); });
  };
  return (
    <Modal title="Daily payment limit" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose} type="button">Cancel</button><button className="btn primary" type="submit" form="lim">Save limit</button></>}>
      <form id="lim" onSubmit={save}>
        <p className="muted">The most you can send from this account in a day (UPI, IMPS, NEFT and RTGS). Lowering it is instant; raising it needs an OTP. Maximum {inr0(a.maxDailyLimit)}.</p>
        <AmountField label="New daily limit" value={v} onChange={(x) => { setV(x); setErr(""); }} error={err} />
      </form>
    </Modal>
  );
}
