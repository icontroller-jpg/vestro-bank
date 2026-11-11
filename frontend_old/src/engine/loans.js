// Loans: eligibility (FOIR), EMI maths, offers, disbursal, EMI payment, part-prepayment and foreclosure.
import { BankError, acct, addMonths, alert, audit, dayDiff, inr, localToday, nowISO, post, rupees, uid, addDays } from "./util.js";
import { createChallenge } from "./otp.js";

export const PRODUCTS = {
  HOME:      { label: "Home loan",      rate: 8.4,  minM: 60, maxM: 360, min: rupees(500000), max: rupees(100000000), feePct: 0.5, prepayPct: 0, blurb: "Floating rate, no prepayment charge" },
  PERSONAL:  { label: "Personal loan",  rate: 11.5, minM: 12, maxM: 60,  min: rupees(50000),  max: rupees(2500000),   feePct: 1.0, prepayPct: 2, blurb: "No collateral, quick decision" },
  VEHICLE:   { label: "Vehicle loan",   rate: 9.25, minM: 12, maxM: 84,  min: rupees(100000), max: rupees(5000000),   feePct: 0.75, prepayPct: 2, blurb: "New and pre-owned vehicles" },
  EDUCATION: { label: "Education loan", rate: 9.5,  minM: 12, maxM: 180, min: rupees(100000), max: rupees(5000000),   feePct: 0.5, prepayPct: 0, blurb: "Domestic and overseas courses" },
};
export const FOIR_LIMIT = 0.5, FOIR_REFER = 0.6;

/** Equated monthly instalment in paise. */
export function emi(principal, annualRate, months) {
  const r = annualRate / 1200;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}
/** Largest principal that keeps the instalment at or under maxEmi. */
export function principalFor(maxEmi, annualRate, months) {
  const r = annualRate / 1200, f = Math.pow(1 + r, months);
  return Math.floor((maxEmi * (f - 1)) / (r * f));
}

/** Full amortisation table. Returns rows {n, due, emi, interest, principal, balance, status}. */
export function schedule(principal, annualRate, months, firstDue, fixedEmi = emi(principal, annualRate, months), startN = 1) {
  const r = annualRate / 1200, rows = [];
  let bal = principal, n = startN, due = firstDue;
  while (bal > 0 && rows.length < 600) {
    const interest = Math.round(bal * r);
    let pay = fixedEmi, princ = pay - interest;
    if (princ >= bal || rows.length === months - 1 && startN === 1) { princ = bal; pay = princ + interest; }
    if (princ <= 0) throw new BankError("EMI too low to repay the loan");
    bal -= princ;
    rows.push({ n, due, emi: pay, interest, principal: princ, balance: bal, status: "UPCOMING" });
    n += 1; due = addMonths(firstDue, rows.length);
  }
  return rows;
}

export const creditBand = (score) => (score >= 780 ? -0.25 : score >= 750 ? 0 : score >= 700 ? 1 : score >= 650 ? 2.5 : null);
export const existingEmi = (st) => st.loans.filter((l) => l.status === "ACTIVE").reduce((s, l) => s + l.emi, 0);

export function assess(st, { product, amount, months }) {
  const p = PRODUCTS[product];
  if (!p) throw new BankError("Choose a loan type");
  const errors = [];
  if (!Number.isInteger(amount) || amount < p.min || amount > p.max) errors.push(`${p.label} amounts run from ${inr(p.min)} to ${inr(p.max)}`);
  if (!Number.isInteger(months) || months < p.minM || months > p.maxM) errors.push(`Tenor must be ${p.minM} to ${p.maxM} months`);
  const adj = creditBand(st.customer.creditScore);
  if (adj === null) errors.push("Your credit score is below our minimum for new loans");
  if (errors.length) return { errors };
  const rate = Math.round((p.rate + adj) * 100) / 100;
  const e = emi(amount, rate, months);
  const fee = Math.round((amount * p.feePct) / 100), gst = Math.round(fee * 0.18);
  const income = st.customer.monthlyIncome, obligations = existingEmi(st);
  const foir = (obligations + e) / income;
  const room = Math.max(0, Math.floor(income * FOIR_LIMIT) - obligations);
  const maxEligible = Math.max(0, Math.min(p.max, principalFor(Math.max(0, room - 100), rate, months)));  // 1 rupee of slack so rounding cannot tip FOIR over the limit
  let decision, reasons = [];
  if (foir <= FOIR_LIMIT) { decision = "APPROVED"; reasons.push(`Your total EMIs would be ${(foir * 100).toFixed(0)}% of income, within our ${FOIR_LIMIT * 100}% limit.`); }
  else if (foir <= FOIR_REFER) { decision = "REFERRED"; reasons.push(`Total EMIs would be ${(foir * 100).toFixed(0)}% of income. A credit officer must review this.`); }
  else { decision = "DECLINED"; reasons.push(`Total EMIs would be ${(foir * 100).toFixed(0)}% of income, above our ${FOIR_REFER * 100}% ceiling.`); }
  if (decision !== "APPROVED") reasons.push(maxEligible >= p.min ? `You can borrow up to ${inr(maxEligible)} over ${months} months.` : "Try a longer tenor or close an existing loan first.");
  return { errors: [], product, amount, months, rate, emi: e, fee, gst, foir, obligations, decision, reasons, maxEligible, totalInterest: e * months - amount };
}

export function createOffer(st, input) {
  const a = assess(st, input);
  if (a.errors.length) throw new BankError(a.errors[0], "VALIDATION");
  const offer = { id: uid(st, "LAP"), ts: nowISO(), ...input, rate: a.rate, emi: a.emi, fee: a.fee, gst: a.gst, decision: a.decision, reasons: a.reasons, maxEligible: a.maxEligible,
    status: a.decision === "APPROVED" ? "OFFERED" : a.decision === "REFERRED" ? "UNDER_REVIEW" : "DECLINED", expiresOn: addDays(localToday(), 7) };
  st.offers.unshift(offer);
  audit(st, "loan.applied", { id: offer.id, decision: a.decision });
  if (a.decision === "REFERRED") alert(st, "info", "Loan application under review", `Your ${PRODUCTS[input.product].label.toLowerCase()} application ${offer.id} is with a credit officer (simulated: usually 2 working days).`);
  return offer;
}

export function requestAccept(st, { offerId, accId }) {
  const o = st.offers.find((x) => x.id === offerId);
  if (!o || o.status !== "OFFERED") throw new BankError("This offer is no longer available");
  if (o.expiresOn < localToday()) { o.status = "EXPIRED"; throw new BankError("This offer has expired. Apply again."); }
  acct(st, accId);
  return createChallenge(st, "LOAN", `accepting ${PRODUCTS[o.product].label.toLowerCase()} of ${inr(o.amount)}`, { type: "acceptLoan", offerId, accId },
    `${inr(o.amount)} will be credited to your account. EMI ${inr(o.emi)} for ${o.months} months.`).id;
}
export function onAcceptLoan(st, { offerId, accId }) {
  const o = st.offers.find((x) => x.id === offerId);
  if (!o || o.status !== "OFFERED") throw new BankError("This offer is no longer available");
  const id = uid(st, "LN"), start = localToday(), first = addMonths(start, 1);
  const rows = schedule(o.amount, o.rate, o.months, first, o.emi);
  post(st, accId, "CR", o.amount, `LOAN DISBURSAL ${PRODUCTS[o.product].label.toUpperCase()} ${id}`, "LOAN", { ref: id });
  post(st, accId, "DR", o.fee + o.gst, `LOAN PROCESSING FEE INCL. GST ${id}`, "FEE", { ref: id });
  const loan = { id, product: o.product, label: PRODUCTS[o.product].label, principal: o.amount, rate: o.rate, months: o.months, emi: o.emi, start, acc: accId, status: "ACTIVE",
    number: "LN" + String(7000000 + st.seq.LN * 389), schedule: rows };
  st.loans.push(loan); o.status = "ACCEPTED"; o.loanId = id;
  audit(st, "loan.disbursed", { id, amount: o.amount });
  alert(st, "info", "Loan disbursed", `${inr(o.amount)} has been credited. Your first EMI of ${inr(o.emi)} is due on ${first}.`);
  return loan;
}

export const outstanding = (l) => l.schedule.filter((r) => r.status !== "PAID").reduce((s, r) => s + r.principal, 0);
export const nextDue = (l) => l.schedule.find((r) => r.status !== "PAID") || null;
export const lateFee = rupees(500);

export function dueNow(l, today = localToday()) {
  const r = nextDue(l);
  if (!r) return null;
  const overdue = r.due < today, days = overdue ? dayDiff(r.due, today) : 0;
  return { row: r, overdue, days, fee: overdue ? lateFee : 0, total: r.emi + (overdue ? lateFee : 0) };
}

export function payEmi(st, { loanId, accId }) {
  const l = st.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "ACTIVE") throw new BankError("Loan not found");
  const d = dueNow(l);
  if (!d) throw new BankError("Nothing is due on this loan");
  if (!d.overdue && dayDiff(localToday(), d.row.due) > 15) throw new BankError(`Your next EMI is due on ${d.row.due}. You can pay up to 15 days early.`);
  post(st, accId, "DR", d.row.emi, `EMI ${d.row.n}/${l.schedule.length} ${l.label.toUpperCase()} ${l.number}`, "LOAN", { ref: l.id });
  if (d.fee) post(st, accId, "DR", d.fee, `LATE PAYMENT FEE ${l.number}`, "FEE", { ref: l.id });
  d.row.status = "PAID"; d.row.paidOn = localToday();
  if (!nextDue(l)) { l.status = "CLOSED"; alert(st, "info", "Loan closed", `${l.label} ${l.number} is fully repaid. Congratulations.`); }
  audit(st, "loan.emi", { id: l.id, n: d.row.n });
  return l;
}

export function prepayQuote(l, amount, today = localToday()) {
  const out = outstanding(l), pct = PRODUCTS[l.product].prepayPct;
  const full = amount >= out;
  const principalPart = full ? out : amount;
  const penalty = Math.round((principalPart * pct) / 100);
  return { out, full, principalPart, penalty, total: principalPart + penalty, min: Math.min(out, Math.max(l.emi, rupees(10000))), pct, today };
}

export function requestPrepay(st, { loanId, accId, amount }) {
  const l = st.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "ACTIVE") throw new BankError("Loan not found");
  const q = prepayQuote(l, amount);
  if (!Number.isInteger(amount) || amount < q.min) throw new BankError(`Minimum part-payment is ${inr(q.min)}`);
  return createChallenge(st, "LOAN", `${q.full ? "closing" : "part-paying"} ${l.label.toLowerCase()} ${l.number}`, { type: "prepayLoan", loanId, accId, amount },
    q.full ? `Foreclosure amount ${inr(q.total)}${q.penalty ? ` including ${inr(q.penalty)} prepayment charge` : ""}.` : `${inr(q.principalPart)} reduces your principal; tenor shortens, EMI stays ${inr(l.emi)}.`).id;
}
export function onPrepay(st, { loanId, accId, amount }) {
  const l = st.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "ACTIVE") throw new BankError("Loan not found");
  const q = prepayQuote(l, amount);
  post(st, accId, "DR", q.total, `${q.full ? "FORECLOSURE" : "PART PREPAYMENT"} ${l.number}`, "LOAN", { ref: l.id });
  const paid = l.schedule.filter((r) => r.status === "PAID"), next = nextDue(l);
  if (q.full) { l.schedule.forEach((r) => { if (r.status !== "PAID") { r.status = "PAID"; r.paidOn = localToday(); } }); l.status = "CLOSED"; }
  else {
    const newBal = q.out - q.principalPart;
    const rows = schedule(newBal, l.rate, 600, next.due, l.emi, paid.length + 1);
    l.schedule = [...paid, ...rows];
  }
  audit(st, "loan.prepaid", { id: l.id, amount: q.total });
  alert(st, "info", q.full ? "Loan closed" : "Part-payment received", q.full ? `${l.label} ${l.number} is closed.` : `Outstanding is now ${inr(outstanding(l))}. ${nextDue(l) ? "Remaining EMIs: " + l.schedule.filter((r) => r.status !== "PAID").length + "." : ""}`);
  return l;
}
