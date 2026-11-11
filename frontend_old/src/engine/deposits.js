// Fixed and recurring deposits. Interest compounds quarterly, the usual Indian convention.
import { BankError, acct, addMonths, alert, audit, dayDiff, inr, localToday, post, rupees, uid } from "./util.js";
import { createChallenge } from "./otp.js";

export const FD_MIN = rupees(5000), RD_MIN = rupees(500);
export const FD_MONTHS = [3, 6, 12, 24, 36, 60, 120], RD_MONTHS = [6, 12, 24, 36, 60];

/** Annual rate (%) by tenor in months. */
export function depositRate(months) {
  if (months <= 3) return 6.0;
  if (months <= 6) return 6.5;
  if (months <= 12) return 7.1;
  if (months <= 24) return 7.25;
  if (months <= 36) return 7.0;
  return 6.75;
}
const grow = (p, rate, years) => p * Math.pow(1 + rate / 400, 4 * years);

export const fdMaturity = (principal, months, rate = depositRate(months)) => Math.round(grow(principal, rate, months / 12));
export function rdMaturity(inst, months, rate = depositRate(months)) {
  let t = 0;
  for (let k = 1; k <= months; k++) t += grow(inst, rate, (months - k + 1) / 12);
  return Math.round(t);
}

export function quoteFD(principal, months) {
  const rate = depositRate(months), maturity = fdMaturity(principal, months, rate);
  return { rate, maturity, interest: maturity - principal };
}
export function quoteRD(inst, months) {
  const rate = depositRate(months), maturity = rdMaturity(inst, months, rate);
  return { rate, maturity, deposited: inst * months, interest: maturity - inst * months };
}

export function openFD(st, { accId, amount, months }) {
  if (!FD_MONTHS.includes(months)) throw new BankError("Choose a tenor from the list");
  if (!Number.isInteger(amount) || amount < FD_MIN) throw new BankError(`Minimum fixed deposit is ${inr(FD_MIN)}`);
  const a = acct(st, accId);
  const q = quoteFD(amount, months), start = localToday();
  const id = uid(st, "FD");
  post(st, a.id, "DR", amount, `FIXED DEPOSIT BOOKING ${id}`, "DEPOSIT", { ref: id });
  const d = { id, kind: "FD", acc: a.id, principal: amount, months, rate: q.rate, start, maturityDate: addMonths(start, months), maturityValue: q.maturity, status: "ACTIVE", number: "FD" + String(5000000 + st.seq.FD * 137) };
  st.deposits.push(d);
  audit(st, "deposit.opened", { id, kind: "FD", amount });
  alert(st, "info", "Fixed deposit opened", `${inr(amount)} for ${months} months at ${q.rate}% p.a. Maturity value ${inr(q.maturity)}.`);
  return d;
}

export function openRD(st, { accId, installment, months }) {
  if (!RD_MONTHS.includes(months)) throw new BankError("Choose a tenor from the list");
  if (!Number.isInteger(installment) || installment < RD_MIN) throw new BankError(`Minimum monthly instalment is ${inr(RD_MIN)}`);
  const a = acct(st, accId);
  const q = quoteRD(installment, months), start = localToday(), id = uid(st, "RD");
  post(st, a.id, "DR", installment, `RD INSTALMENT 1/${months} ${id}`, "DEPOSIT", { ref: id });
  const d = { id, kind: "RD", acc: a.id, installment, months, rate: q.rate, start, maturityDate: addMonths(start, months), maturityValue: q.maturity, paid: 1, nextDue: addMonths(start, 1), status: "ACTIVE", number: "RD" + String(6000000 + st.seq.RD * 211) };
  st.deposits.push(d);
  audit(st, "deposit.opened", { id, kind: "RD", installment });
  alert(st, "info", "Recurring deposit opened", `${inr(installment)} a month for ${months} months at ${q.rate}% p.a. Maturity value ${inr(q.maturity)}.`);
  return d;
}

export function payRD(st, { depId, accId }) {
  const d = st.deposits.find((x) => x.id === depId);
  if (!d || d.kind !== "RD" || d.status !== "ACTIVE") throw new BankError("Recurring deposit not found");
  if (d.paid >= d.months) throw new BankError("All instalments are already paid");
  const a = acct(st, accId || d.acc);
  post(st, a.id, "DR", d.installment, `RD INSTALMENT ${d.paid + 1}/${d.months} ${d.id}`, "DEPOSIT", { ref: d.id });
  d.paid += 1; d.nextDue = d.paid < d.months ? addMonths(d.nextDue, 1) : null;
  audit(st, "deposit.rd.paid", { id: d.id, n: d.paid });
  return d;
}

/** What you would get if you closed today. Premature closure: 1% lower rate, nothing before 7 days. */
export function prematureValue(d, today = localToday()) {
  const days = Math.max(0, dayDiff(d.start, today)), years = days / 365;
  if (days < 7) return { value: d.kind === "FD" ? d.principal : d.installment * d.paid, rate: 0, penalty: true, days };
  const rate = Math.max(0, depositRate(Math.max(1, Math.floor(days / 30))) - 1);
  if (d.kind === "FD") return { value: Math.round(grow(d.principal, rate, years)), rate, penalty: true, days };
  let v = 0;
  for (let k = 0; k < d.paid; k++) v += grow(d.installment, rate, Math.max(0, years - k / 12));
  return { value: Math.round(v), rate, penalty: true, days };
}

export function requestClose(st, id) {
  const d = st.deposits.find((x) => x.id === id);
  if (!d || d.status !== "ACTIVE") throw new BankError("Deposit not found");
  const pv = prematureValue(d);
  return createChallenge(st, "DEPOSIT", `closing ${d.kind} ${d.number}`, { type: "closeDeposit", depId: id },
    `You will receive about ${inr(pv.value)} instead of ${inr(d.maturityValue)} at maturity.`).id;
}
export function onCloseDeposit(st, { depId }) {
  const d = st.deposits.find((x) => x.id === depId);
  if (!d || d.status !== "ACTIVE") throw new BankError("Deposit already closed");
  const pv = prematureValue(d);
  post(st, d.acc, "CR", pv.value, `PREMATURE CLOSURE ${d.kind} ${d.number}`, "DEPOSIT", { ref: d.id });
  d.status = "CLOSED"; d.closedOn = localToday(); d.closedValue = pv.value;
  audit(st, "deposit.closed", { id: d.id, value: pv.value });
  alert(st, "info", "Deposit closed", `${inr(pv.value)} credited to your account for ${d.kind} ${d.number}.`);
  return d;
}

/** Credit matured deposits (runs when the app opens). */
export function processMaturities(st) {
  const today = localToday();
  for (const d of st.deposits) {
    if (d.status !== "ACTIVE" || d.maturityDate > today) continue;
    post(st, d.acc, "CR", d.maturityValue, `MATURITY PROCEEDS ${d.kind} ${d.number}`, "DEPOSIT", { ref: d.id });
    d.status = "MATURED"; d.closedOn = d.maturityDate; d.closedValue = d.maturityValue;
    alert(st, "info", "Deposit matured", `${inr(d.maturityValue)} was credited to your account for ${d.kind} ${d.number}.`);
  }
}
