import React from "react";
import { useBank } from "../api.js";
import { fmtDateTime } from "../engine/index.js";
import { Card, Empty, Page, Pill } from "../components/ui.jsx";

const LEVEL = { info: "info", warn: "warn", crit: "bad" };
const NAME = { "otp.sent": "OTP sent", "otp.verified": "OTP verified", "otp.failed": "Wrong OTP entered", "otp.expired": "OTP expired", "otp.resent": "OTP resent", login: "Signed in", logout: "Signed out", "login.failed": "Failed sign-in",
  "payment.requested": "Payment requested", "payment.completed": "Payment completed", "payment.blocked": "Payment blocked", "payment.cancelled": "Payment cancelled", "beneficiary.added": "Payee added", "beneficiary.removed": "Payee removed",
  "deposit.opened": "Deposit opened", "deposit.closed": "Deposit closed", "loan.applied": "Loan applied", "loan.disbursed": "Loan disbursed", "loan.emi": "EMI paid", "loan.prepaid": "Loan prepaid", "card.frozen": "Card frozen", "card.unfrozen": "Card unfrozen",
  "card.blocked": "Card blocked", "card.activated": "Card activated", "card.declined": "Card purchase declined", "card.setting": "Card setting raised", "card.channel.off": "Card channel off", "card.limit.lowered": "Card limit lowered", "card.billpaid": "Card bill paid", "device.trust": "Device setting changed", "limit.raised": "Daily limit raised", "limit.lowered": "Daily limit lowered" };

export default function Activity() {
  const { state: s, call } = useBank();
  const unread = s.alerts.filter((a) => !a.read).length;
  return (
    <Page title="Alerts & activity" sub="Notifications from the bank and a record of security-relevant actions on your profile"
      actions={<button className="btn" onClick={() => call("markAlertsRead")} disabled={!unread}>Mark all as read</button>}>
      <Card title={`Alerts${unread ? ` · ${unread} new` : ""}`} flush>
        {!s.alerts.length ? <div className="pad"><Empty title="No alerts" /></div> : <ul className="rows pad">{s.alerts.slice(0, 25).map((a) => (
          <li key={a.id} className={a.read ? "" : "unread"}><Pill tone={LEVEL[a.level]}>{a.level === "crit" ? "Critical" : a.level === "warn" ? "Warning" : "Info"}</Pill><div className="grow"><b>{a.title}</b><div className="muted">{a.text}</div></div><span className="muted small nowrap">{fmtDateTime(a.ts)}</span></li>))}</ul>}
      </Card>
      <Card title="Account activity log" sub="Most recent first. If you don't recognise something, call the helpline immediately." flush>
        <div className="tablewrap"><table><thead><tr><th>When</th><th>Event</th><th>Details</th></tr></thead><tbody>
          {s.audit.slice(0, 60).map((a) => <tr key={a.id}><td className="nowrap">{fmtDateTime(a.ts)}</td><td>{NAME[a.action] || a.action}</td><td className="muted small">{Object.entries(a.detail || {}).filter(([k]) => !/^(id|code)$/.test(k) || typeof a.detail[k] !== "string").map(([k, v]) => `${k}: ${typeof v === "number" && /amount|value/i.test(k) ? (v / 100).toLocaleString("en-IN") : v}`).join(" · ")}</td></tr>)}</tbody></table></div>
      </Card>
    </Page>
  );
}
