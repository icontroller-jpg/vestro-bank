// Public API of the simulated bank: a tiny store plus a catalogue of actions.
import { BankError, acct, alert, audit, nowISO, post } from "./util.js";
import { createSeedState } from "./seed.js";
import { cancelChallenge, createChallenge, getChallenge, publicChallenge, registerHandler, resendOtp, verifyOtp } from "./otp.js";
import * as pay from "./payments.js";
import * as dep from "./deposits.js";
import * as loan from "./loans.js";
import * as cards from "./cards.js";

export * from "./util.js";
export { MODES } from "./payments.js";
export { PRODUCTS, emi, schedule, outstanding, nextDue, dueNow, prepayQuote, assess as assessLoan } from "./loans.js";
export { depositRate, quoteFD, quoteRD, prematureValue, fdMaturity, rdMaturity, FD_MIN, RD_MIN, FD_MONTHS, RD_MONTHS } from "./deposits.js";
export { CHANNELS, LIMIT_CAPS, creditAvailable } from "./cards.js";
export { quotePayment, VPA_RE, IFSC_RE } from "./payments.js";
export { THRESHOLDS, WATCHLIST } from "./fraud.js";
export { OTP_TTL_MS, RESEND_AFTER_MS, MAX_ATTEMPTS } from "./otp.js";

registerHandler("payment", pay.onPaymentVerified); registerHandler("payment:cancel", pay.onPaymentCancelled);
registerHandler("addBeneficiary", pay.onAddBeneficiary);
registerHandler("closeDeposit", dep.onCloseDeposit);
registerHandler("acceptLoan", loan.onAcceptLoan);
registerHandler("prepayLoan", loan.onPrepay);
registerHandler("cardSetting", cards.onCardSetting);
registerHandler("blockCard", cards.onBlockCard);
registerHandler("login", (st) => { st.session = { active: true, at: nowISO() }; audit(st, "login", {}); return true; });
registerHandler("setLimit", (st, { accId, value }) => { acct(st, accId).dailyLimit = value; audit(st, "limit.raised", { accId, value }); return true; });

export const ACTIONS = {
  login(st, userId, password) {
    if (String(userId).trim().toLowerCase() !== st.customer.userId || password !== "Demo@2026") { audit(st, "login.failed", { userId }); throw new BankError("User ID or password is incorrect", "AUTH"); }
    return createChallenge(st, "LOGIN", "signing in to Vestro", { type: "login" }, "We sent this OTP to your registered mobile number.").id;
  },
  logout(st) { st.session = { active: false }; audit(st, "logout", {}); },
  verifyOtp: (st, id, code) => verifyOtp(st, id, code),
  resendOtp: (st, id) => resendOtp(st, id),
  cancelOtp: (st, id) => cancelChallenge(st, id),

  initiatePayment: (st, draft) => pay.initiatePayment(st, draft),
  cancelPayment: (st, id) => pay.cancelPayment(st, id),
  confirmHeld: (st, id) => pay.confirmHeld(st, id),
  addBeneficiary: (st, b) => pay.requestAddBeneficiary(st, b),
  removeBeneficiary: (st, id) => pay.removeBeneficiary(st, id),

  openFD: (st, a) => dep.openFD(st, a), openRD: (st, a) => dep.openRD(st, a), payRD: (st, a) => dep.payRD(st, a), closeDeposit: (st, id) => dep.requestClose(st, id),

  applyLoan: (st, a) => loan.createOffer(st, a), acceptLoan: (st, a) => loan.requestAccept(st, a), payEmi: (st, a) => loan.payEmi(st, a), prepayLoan: (st, a) => loan.requestPrepay(st, a),

  freezeCard: (st, id, on) => cards.freeze(st, id, on), cardSetting: (st, a) => cards.requestSetting(st, a), blockCard: (st, id) => cards.requestBlock(st, id),
  activateCard: (st, id) => cards.activate(st, id), authorise: (st, a) => cards.authorise(st, a), payCardBill: (st, a) => cards.payCardBill(st, a),

  setDeviceTrusted(st, on) {
    st.settings.deviceTrusted = !!on; audit(st, "device.trust", { on });
    if (!on) alert(st, "warn", "New device simulation on", "Payments will now be scored as if made from a device we don't recognise.");
  },
  setDailyLimit(st, { accId, value }) {
    const a = acct(st, accId);
    if (!Number.isInteger(value) || value < 100000) throw new BankError("Enter a limit of at least ₹1,000");
    if (value > a.maxDailyLimit) throw new BankError(`The highest daily limit for this account is ₹${(a.maxDailyLimit / 100).toLocaleString("en-IN")}`);
    if (value <= a.dailyLimit) { a.dailyLimit = value; audit(st, "limit.lowered", { accId, value }); return { applied: true }; }
    return { challenge: createChallenge(st, "LIMIT", `raising daily limit to ₹${(value / 100).toLocaleString("en-IN")}`, { type: "setLimit", accId, value }).id };
  },
  markAlertsRead(st) { st.alerts.forEach((a) => (a.read = true)); },
  deposit(st, { accId, amount, desc }) { return post(st, accId, "CR", amount, desc || "CASH DEPOSIT", "CASH"); }, // demo helper: top-up
};

export function processDue(st) { dep.processMaturities(st); }
export const challengeView = (st, id) => publicChallenge(getChallenge(st, id));

/** A minimal external store (works with React's useSyncExternalStore and in plain Node tests). */
export function createBank({ storageKey = "vestro-bank-portal-v3", seed = 2026 } = {}) {
  const ls = (() => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } })();
  let state = null;
  try { const raw = ls?.getItem(storageKey); if (raw) { const s = JSON.parse(raw); if (s?.v === 3) state = s; } } catch { /* ignore */ }
  if (!state) state = createSeedState(seed);
  processDue(state);
  const subs = new Set();
  const persist = () => { try { ls?.setItem(storageKey, JSON.stringify(state)); } catch { /* quota or private mode */ } };
  const commit = (s) => { state = s; persist(); subs.forEach((f) => f()); };
  return {
    getState: () => state,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    dispatch(name, ...args) {
      const fn = ACTIONS[name];
      if (!fn) throw new Error(`Unknown action ${name}`);
      const draft = structuredClone(state);
      const result = fn(draft, ...args);   // throws BankError => nothing is committed
      commit(draft);
      return result;
    },
    reset() { try { ls?.removeItem(storageKey); } catch { /* ignore */ } commit(createSeedState(seed)); },
    challenge: (id) => { const c = state.challenges.find((x) => x.id === id); return c ? publicChallenge(c) : null; },
    /** Demo only: the code the simulated SMS would carry. */
    smsFor: (id) => state.sms.find((m) => m.challenge === id) || null,
  };
}
