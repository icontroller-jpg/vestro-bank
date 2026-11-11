// Shared helpers. Money is always integer paise. Dates: "YYYY-MM-DD" strings for calendar dates, ISO for timestamps.

export const clock = { now: () => new Date() };

export class BankError extends Error {
  constructor(message, code = "INVALID") { super(message); this.name = "BankError"; this.code = code; }
}

const pad = (n) => String(n).padStart(2, "0");
export const nowISO = () => clock.now().toISOString();
export const localToday = () => { const n = clock.now(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
export const localDate = (iso) => { const n = new Date(iso); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };

export const rupees = (r) => Math.round(r * 100);
const INR2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const inr = (p) => INR2.format((p || 0) / 100);
export const inr0 = (p) => INR0.format((p || 0) / 100);

/** Parse a user-typed rupee amount ("12,500.50") into paise, or null if invalid. */
export function parseAmount(v) {
  const s = String(v ?? "").replace(/[,\s₹]/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

const D = (s) => new Date(`${s}T00:00:00Z`);
const S = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
export function addMonths(s, n) {
  const d = D(s), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return S(d);
}
export const dayDiff = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const DT = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
export const fmtDate = (s) => (s ? DATE.format(D(String(s).slice(0, 10))) : "–");
export const fmtDateTime = (iso) => (iso ? DT.format(new Date(iso)) : "–");

export const mask = (n) => "XXXX" + String(n).slice(-4);

/** Deterministic PRNG that lives in state (mulberry32), so a seed reproduces the same bank. */
export function rand(st) {
  st.rng = (st.rng + 0x6d2b79f5) | 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (st, a, b) => a + Math.floor(rand(st) * (b - a + 1));
export const pick = (st, arr) => arr[Math.floor(rand(st) * arr.length)];
export const uid = (st, p) => { st.seq[p] = (st.seq[p] || 0) + 1; return `${p}${String(st.seq[p]).padStart(5, "0")}`; };
export const utr = (st) => "VST" + String(randInt(st, 10 ** 11, 10 ** 12 - 1));

export function audit(st, action, detail = {}) {
  st.audit.unshift({ id: uid(st, "AUD"), ts: nowISO(), action, detail });
  if (st.audit.length > 300) st.audit.length = 300;
}
export function alert(st, level, title, text) {
  st.alerts.unshift({ id: uid(st, "ALT"), ts: nowISO(), level, title, text, read: false });
  if (st.alerts.length > 100) st.alerts.length = 100;
}

export const acct = (st, id) => {
  const a = st.accounts.find((x) => x.id === id);
  if (!a) throw new BankError("Account not found");
  return a;
};
export const available = (a) => a.balance - a.hold;

/** Post a ledger entry and move the balance. Throws if it would overdraw. */
export function post(st, accId, kind, amount, desc, mode, extra = {}) {
  const a = acct(st, accId);
  if (amount <= 0) throw new BankError("Amount must be positive");
  if (kind === "DR") {
    if (a.status !== "ACTIVE") throw new BankError("Account is not active");
    if (available(a) < amount) throw new BankError("Insufficient available balance", "FUNDS");
    a.balance -= amount;
  } else a.balance += amount;
  const t = { id: uid(st, "TXN"), acc: accId, ts: nowISO(), kind, amount, bal: a.balance, desc, mode, ...extra };
  st.txns.push(t);
  return t;
}
