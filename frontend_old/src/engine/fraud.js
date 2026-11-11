// Rule-based payment risk scoring. Transparent on purpose: every point has a reason the customer can read.
import { clock, inr0, rupees } from "./util.js";

// Fictional payee identifiers the bank's fraud team has flagged (mule accounts / scam handles).
export const WATCHLIST = new Set(["refund.desk@vstb", "lucky.draw@vstb", "kyc.update@vstb", "9999000011", "9999000022"]);

export const THRESHOLDS = { otp: 25, hold: 60, block: 90, otpAmount: rupees(5000), newPayeeCap: rupees(50000), newPayeeHours: 24 };

export function avgOutflow(st, accId) {
  const cutoff = clock.now().getTime() - 90 * 864e5;
  const xs = st.payments.filter((p) => p.from === accId && p.status === "COMPLETED" && p.mode !== "OWN" && Date.parse(p.ts) >= cutoff).map((p) => p.amount);
  return xs.length >= 3 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : rupees(5000);
}

export function assess(st, { from, mode, amount }, payee, accountAvailable) {
  const reasons = [];
  const add = (code, points, text) => reasons.push({ code, points, text });
  const hour = clock.now().getHours();

  // Moving money between your own accounts is low-risk: only the device check and very large sums matter.
  if (payee.kind === "OWN") {
    if (!st.settings.deviceTrusted) add("DEVICE", 30, "You are signing in from a device we don't recognise.");
    const score = reasons.reduce((x, r) => x + r.points, 0);
    return { score, reasons, decision: score >= THRESHOLDS.otp || amount >= rupees(100000) ? "OTP" : "ALLOW" };
  }

  if (payee.watch) add("WATCHLIST", 70, "The payee has been reported to the bank's fraud team.");
  if (payee.newPayee) add("NEW_PAYEE", 25, payee.kind === "VPA" ? "You haven't paid this UPI ID before." : "This payee was added less than 24 hours ago.");
  if (payee.newPayee && amount >= rupees(25000)) add("NEW_PAYEE_LARGE", 15, "Large first payment to a new payee.");

  const avg = avgOutflow(st, from);
  if (amount > 5 * avg && amount >= rupees(25000)) add("AMOUNT_ANOMALY", 30, `Much higher than your usual payment of about ${inr0(avg)}.`);
  else if (amount > 3 * avg && amount >= rupees(10000)) add("AMOUNT_HIGH", 20, `Higher than your usual payment of about ${inr0(avg)}.`);

  if (amount >= rupees(25000) && accountAvailable > 0 && amount >= accountAvailable / 2) add("BALANCE_SHARE", 15, "More than half of your available balance.");
  if (amount >= rupees(200000)) add("HIGH_VALUE", 10, "High-value payment.");

  const recent = st.payments.filter((p) => p.from === from && ["COMPLETED", "HELD", "PENDING_OTP"].includes(p.status) && clock.now().getTime() - Date.parse(p.ts) < 3600e3).length;
  if (recent >= 3) add("VELOCITY", 20, "Several payments in the last hour.");
  else if (recent === 2) add("VELOCITY", 10, "A few payments in the last hour.");

  if (hour < 5 && amount >= rupees(10000)) add("NIGHT", 15, "Large payment between midnight and 5 am.");
  if (!st.settings.deviceTrusted) add("DEVICE", 30, "You are signing in from a device we don't recognise.");

  const score = reasons.reduce((s, r) => s + r.points, 0);
  let decision = "ALLOW";
  if (score >= THRESHOLDS.block) decision = "BLOCK";
  else if (score >= THRESHOLDS.hold) decision = "HOLD";
  else if (score >= THRESHOLDS.otp || (mode !== "OWN" && amount >= THRESHOLDS.otpAmount) || (mode === "OWN" && amount >= rupees(100000))) decision = "OTP";
  return { score, reasons, decision };
}

