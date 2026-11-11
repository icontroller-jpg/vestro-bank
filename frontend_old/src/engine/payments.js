// Payments: validation, fees, limits, fraud decision, execution, holds. Funds only move in executePayment().
import { BankError, acct, alert, audit, available, clock, inr, localToday, localDate, mask, nowISO, post, rupees, uid, utr } from "./util.js";
import { assess, THRESHOLDS, WATCHLIST } from "./fraud.js";
import { createChallenge } from "./otp.js";

export const MODES = {
  OWN:  { label: "Own account", min: 1, max: Infinity, eta: "Instant", fee: () => 0 },
  UPI:  { label: "UPI", min: 1, max: rupees(100000), eta: "Instant", fee: () => 0 },
  IMPS: { label: "IMPS", min: 1, max: rupees(500000), eta: "Instant, 24×7",
          fee: (a) => (a <= rupees(1000) ? 0 : a <= rupees(100000) ? rupees(5) : a <= rupees(200000) ? rupees(15) : rupees(25)) },
  NEFT: { label: "NEFT", min: 1, max: rupees(2500000), eta: "Within about 2 hours", fee: () => 0 },
  RTGS: { label: "RTGS", min: rupees(200000), max: rupees(10000000), eta: "Real time", fee: () => 0 },
};
export const GST = 0.18;
export const VPA_RE = /^[a-z0-9._-]{2,40}@[a-z]{2,20}$/i;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const bankOf = (ifsc) => (String(ifsc).toUpperCase().startsWith("VSTB") ? "Vestro Bank" : "Other bank");

const hoursSince = (iso) => (clock.now().getTime() - Date.parse(iso)) / 36e5;

export function resolvePayee(st, to) {
  if (!to) throw new BankError("Choose who you are paying");
  if (to.type === "OWN") {
    const a = acct(st, to.accId);
    return { kind: "OWN", key: a.id, name: `Your ${a.type === "SAVINGS" ? "Savings" : "Current"} account`, label: `${a.type === "SAVINGS" ? "Savings" : "Current"} ${mask(a.number)}`, own: a, newPayee: false, watch: false };
  }
  if (to.type === "BENEFICIARY") {
    const b = st.beneficiaries.find((x) => x.id === to.id);
    if (!b) throw new BankError("Payee not found");
    const key = b.kind === "UPI" ? b.vpa : b.acct;
    return { kind: b.kind === "UPI" ? "UPI" : "ACCT", key, name: b.name, label: b.kind === "UPI" ? b.vpa : `${b.name} · ${mask(b.acct)}`, benef: b,
      newPayee: hoursSince(b.addedAt) < THRESHOLDS.newPayeeHours, watch: WATCHLIST.has(key) };
  }
  if (to.type === "VPA") {
    const vpa = String(to.vpa || "").trim().toLowerCase();
    if (!VPA_RE.test(vpa)) throw new BankError("Enter a valid UPI ID, for example name@vstb");
    const known = st.beneficiaries.find((b) => b.kind === "UPI" && b.vpa === vpa);
    return { kind: "UPI", key: vpa, name: known?.name || vpa, label: vpa, benef: known, newPayee: known ? hoursSince(known.addedAt) < THRESHOLDS.newPayeeHours : true, watch: WATCHLIST.has(vpa) };
  }
  throw new BankError("Unsupported payee");
}

function dailyUsed(st, accId) {
  const today = localToday();
  return st.payments.filter((p) => p.from === accId && p.mode !== "OWN" && ["COMPLETED", "HELD"].includes(p.status) && localDate(p.ts) === today).reduce((s, p) => s + p.amount, 0);
}

/** Validate and price a payment, then score it. Never changes state. */
export function quotePayment(st, draft) {
  const errors = [];
  let payee = null, from = null;
  try { from = acct(st, draft.from); } catch (e) { errors.push(e.message); }
  const mode = MODES[draft.mode];
  if (!mode) errors.push("Choose how to pay");
  try { payee = resolvePayee(st, draft.to); } catch (e) { errors.push(e.message); }
  const amount = draft.amount;
  if (!Number.isInteger(amount) || amount <= 0) errors.push("Enter an amount greater than zero");
  if (errors.length) return { errors, info: null, risk: null };

  if (from.status !== "ACTIVE") errors.push("This account is not active");
  if (payee.kind === "OWN" && payee.own.id === from.id) errors.push("Choose a different account to transfer to");
  if (payee.kind === "OWN" && draft.mode !== "OWN") errors.push("Transfers between your own accounts use 'Own account'");
  if (payee.kind !== "OWN" && draft.mode === "OWN") errors.push("Pick UPI, IMPS, NEFT or RTGS for other payees");
  if (payee.kind === "UPI" && draft.mode !== "UPI") errors.push("UPI IDs can only be paid by UPI");
  if (payee.kind === "ACCT" && draft.mode === "UPI") errors.push("Bank-account payees can be paid by IMPS, NEFT or RTGS");
  if (amount < mode.min) errors.push(`${mode.label} needs at least ${inr(mode.min)}`);
  if (amount > mode.max) errors.push(`${mode.label} allows at most ${inr(mode.max)} per payment`);
  if (payee.newPayee && payee.kind !== "OWN" && amount > THRESHOLDS.newPayeeCap) errors.push(`New payees have a ${inr(THRESHOLDS.newPayeeCap)} limit for the first 24 hours`);

  const fee = mode.fee(amount), gst = Math.round(fee * GST), total = amount + fee + gst;
  if (total > available(from)) errors.push(`Insufficient balance. Available: ${inr(available(from))}`);
  if (payee.kind !== "OWN" && dailyUsed(st, from.id) + amount > from.dailyLimit) errors.push(`Over your daily limit of ${inr(from.dailyLimit)}. Used today: ${inr(dailyUsed(st, from.id))}`);
  const info = { payee, fee, gst, total, amount, mode: draft.mode, eta: mode.eta };
  if (errors.length) return { errors, info, risk: null };
  return { errors: [], info, risk: assess(st, draft, payee, available(from)) };
}

export function executePayment(st, p) {
  const from = acct(st, p.from);
  try {
    if (p.status === "HELD") from.hold -= p.total;
    const mode = p.mode, via = MODES[mode].label;
    const label = p.payee.label;
    if (mode === "OWN") {
      const to = acct(st, p.payee.key);
      post(st, from.id, "DR", p.amount, `${via} TRANSFER TO ${to.type} ${mask(to.number)}`, mode, { ref: p.utr });
      post(st, to.id, "CR", p.amount, `${via} TRANSFER FROM ${from.type} ${mask(from.number)}`, mode, { ref: p.utr });
    } else {
      post(st, from.id, "DR", p.amount, `${via}/${p.utr}/${label}${p.remark ? "/" + p.remark : ""}`.toUpperCase(), mode, { ref: p.utr });
      if (p.fee) post(st, from.id, "DR", p.fee + p.gst, `${via} CHARGES INCL. GST ${p.utr}`, "FEE", { ref: p.utr });
    }
    p.status = "COMPLETED"; p.completedAt = nowISO();
    p.history.push({ ts: nowISO(), event: "Payment completed" });
    alert(st, "info", "Payment successful", `${inr(p.amount)} sent to ${label} by ${MODES[mode].label}. Ref ${p.utr}.`);
    audit(st, "payment.completed", { id: p.id, amount: p.amount, mode });
  } catch (e) {
    p.status = "FAILED"; p.failure = e.message;
    p.history.push({ ts: nowISO(), event: `Failed: ${e.message}` });
    alert(st, "warn", "Payment failed", `${inr(p.amount)} to ${p.payee.label} could not be completed: ${e.message}. No money has left your account.`);
  }
  return p;
}

export function cancelPayment(st, id, reason = "Cancelled by you") {
  const p = st.payments.find((x) => x.id === id);
  if (!p) throw new BankError("Payment not found");
  if (!["PENDING_OTP", "HELD"].includes(p.status)) throw new BankError("This payment can no longer be cancelled");
  if (p.status === "HELD") acct(st, p.from).hold -= p.total;
  p.status = "CANCELLED"; p.failure = reason;
  p.history.push({ ts: nowISO(), event: reason });
  audit(st, "payment.cancelled", { id, reason });
  return p;
}

function block(st, p, why) {
  if (p.status === "HELD") acct(st, p.from).hold -= p.total;
  p.status = "BLOCKED"; p.failure = why;
  p.history.push({ ts: nowISO(), event: why });
  alert(st, "crit", "Payment blocked", `${inr(p.amount)} to ${p.payee.label} was blocked: ${why} No money has left your account. Call the 24×7 helpline (simulated) if you did not request it.`);
  audit(st, "payment.blocked", { id: p.id, why });
}

export function initiatePayment(st, draft) {
  const q = quotePayment(st, draft);
  if (q.errors.length) throw new BankError(q.errors[0], "VALIDATION");
  const { info, risk } = q;
  const p = { id: uid(st, "PAY"), ts: nowISO(), from: draft.from, mode: draft.mode, amount: info.amount, fee: info.fee, gst: info.gst, total: info.total,
    remark: String(draft.remark || "").slice(0, 40), payee: { kind: info.payee.kind, key: info.payee.key, name: info.payee.name, label: info.payee.label },
    risk, status: "PENDING_OTP", utr: utr(st), history: [{ ts: nowISO(), event: "Payment requested" }] };
  st.payments.unshift(p);
  audit(st, "payment.requested", { id: p.id, amount: p.amount, mode: p.mode, score: risk.score, decision: risk.decision });

  if (risk.decision === "BLOCK") { block(st, p, "This payment looks like a scam."); return { payment: p, challenge: null }; }
  if (risk.decision === "ALLOW") { executePayment(st, p); return { payment: p, challenge: null }; }
  if (risk.decision === "HOLD") {
    acct(st, p.from).hold += p.total; p.status = "HELD";
    p.history.push({ ts: nowISO(), event: "Held for your confirmation after a security check" });
    alert(st, "crit", "Payment on hold", `${inr(p.amount)} to ${p.payee.label} is on hold because it looks unusual. Confirm it's you with an OTP, or cancel it.`);
  }
  const ch = createChallenge(st, "PAYMENT", `${inr(p.amount)} to ${p.payee.name}`, { type: "payment", paymentId: p.id },
    risk.decision === "HOLD" ? "This payment was flagged. Confirming means you are sure you know and trust this payee." : "");
  p.challengeId = ch.id;
  return { payment: p, challenge: ch.id };
}

/** After the OTP is verified. Held payments are re-checked: watch-listed payees are never released. */
export function onPaymentVerified(st, { paymentId }) {
  const p = st.payments.find((x) => x.id === paymentId);
  if (!p) throw new BankError("Payment not found");
  if (!["PENDING_OTP", "HELD"].includes(p.status)) throw new BankError("This payment is no longer waiting for confirmation");
  if (p.risk.reasons.some((r) => r.code === "WATCHLIST")) { block(st, p, "The payee is on the bank's fraud watch-list."); return p; }
  return executePayment(st, p);
}
export const onPaymentCancelled = (st, { paymentId }, why) => { try { cancelPayment(st, paymentId, why); } catch { /* already closed */ } };

/** Re-issue an OTP for a held payment whose first challenge was closed. */
export function confirmHeld(st, id) {
  const p = st.payments.find((x) => x.id === id);
  if (!p || p.status !== "HELD") throw new BankError("This payment is not on hold");
  const ch = createChallenge(st, "PAYMENT", `${inr(p.amount)} to ${p.payee.name}`, { type: "payment", paymentId: p.id }, "This payment was flagged. Confirming means you are sure you know and trust this payee.");
  p.challengeId = ch.id; return ch.id;
}

/* ───────── payees ───────── */
export function draftBeneficiary(st, b) {
  const name = String(b.name || "").trim();
  if (name.length < 2) throw new BankError("Enter the payee's name");
  const out = { name, nick: String(b.nick || "").trim() };
  if (b.kind === "UPI") {
    const vpa = String(b.vpa || "").trim().toLowerCase();
    if (!VPA_RE.test(vpa)) throw new BankError("Enter a valid UPI ID, for example name@vstb");
    if (st.beneficiaries.some((x) => x.vpa === vpa)) throw new BankError("This UPI ID is already saved");
    return { ...out, kind: "UPI", vpa };
  }
  const acctNo = String(b.acct || "").replace(/\s/g, ""), ifsc = String(b.ifsc || "").trim().toUpperCase();
  if (!/^\d{9,18}$/.test(acctNo)) throw new BankError("Account number must be 9 to 18 digits");
  if (!IFSC_RE.test(ifsc)) throw new BankError("IFSC must look like VSTB0000123 (4 letters, 0, then 6 characters)");
  if (acctNo !== String(b.acct2 ?? acctNo).replace(/\s/g, "")) throw new BankError("The two account numbers do not match");
  if (st.beneficiaries.some((x) => x.acct === acctNo && x.ifsc === ifsc)) throw new BankError("This account is already saved");
  return { ...out, kind: "ACCOUNT", acct: acctNo, ifsc, bank: bankOf(ifsc) };
}
export function requestAddBeneficiary(st, b) {
  const d = draftBeneficiary(st, b);
  return createChallenge(st, "BENEFICIARY", `adding payee ${d.name}`, { type: "addBeneficiary", draft: d }, "New payees can receive up to ₹50,000 for the first 24 hours.").id;
}
export function onAddBeneficiary(st, { draft }) {
  const b = { id: uid(st, "BEN"), ...draft, addedAt: nowISO() };
  st.beneficiaries.push(b);
  audit(st, "beneficiary.added", { id: b.id });
  alert(st, "info", "Payee added", `${b.name} was added. For your safety, payments to new payees are capped at ${inr(THRESHOLDS.newPayeeCap)} for 24 hours.`);
  return b;
}
export function removeBeneficiary(st, id) {
  const i = st.beneficiaries.findIndex((b) => b.id === id);
  if (i < 0) throw new BankError("Payee not found");
  const [b] = st.beneficiaries.splice(i, 1);
  audit(st, "beneficiary.removed", { id }); return b;
}
