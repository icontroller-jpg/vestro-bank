// One-time-password step-up. Every sensitive action is stored as a *challenge* carrying a payload;
// the payload only runs after the right code is entered. SMS delivery is simulated (shown in the portal).
import { BankError, alert, audit, clock, nowISO, rand, uid } from "./util.js";

export const OTP_TTL_MS = 120_000;
export const RESEND_AFTER_MS = 30_000;
export const MAX_ATTEMPTS = 3;
export const MAX_RESENDS = 3;

const handlers = {};
export const registerHandler = (type, fn) => { handlers[type] = fn; };

function sendSms(st, ch) {
  ch.code = String(100000 + Math.floor(rand(st) * 900000));
  const now = clock.now().getTime();
  ch.expiresAt = new Date(now + OTP_TTL_MS).toISOString();
  ch.lastSentAt = new Date(now).toISOString();
  st.sms.unshift({ id: uid(st, "SMS"), ts: nowISO(), challenge: ch.id, otp: ch.code,
    text: `${ch.code} is your Vestro OTP for ${ch.label}. Valid for 2 minutes. Never share it with anyone, including bank staff.` });
  if (st.sms.length > 25) st.sms.length = 25;
}

export function createChallenge(st, purpose, label, payload, hint = "") {
  const ch = { id: uid(st, "OTP"), purpose, label, hint, payload, status: "PENDING", attempts: 0, resends: 0, createdAt: nowISO() };
  st.challenges.push(ch);
  if (st.challenges.length > 60) st.challenges.splice(0, st.challenges.length - 60);
  sendSms(st, ch);
  audit(st, "otp.sent", { id: ch.id, purpose });
  return ch;
}

export const getChallenge = (st, id) => {
  const c = st.challenges.find((x) => x.id === id);
  if (!c) throw new BankError("This verification request no longer exists", "NOT_FOUND");
  return c;
};

/** Public view of a challenge: never exposes the code. */
export const publicChallenge = (c) => ({ id: c.id, purpose: c.purpose, label: c.label, hint: c.hint, status: c.status,
  attemptsLeft: MAX_ATTEMPTS - c.attempts, resendsLeft: MAX_RESENDS - c.resends, expiresAt: c.expiresAt, lastSentAt: c.lastSentAt });

export function resendOtp(st, id) {
  const c = getChallenge(st, id);
  if (c.status !== "PENDING") throw new BankError("This request is closed. Start again.");
  if (c.resends >= MAX_RESENDS) throw new BankError("Resend limit reached. Cancel and start again.");
  if (clock.now().getTime() - Date.parse(c.lastSentAt) < RESEND_AFTER_MS) throw new BankError("Please wait a few seconds before requesting a new OTP.", "COOLDOWN");
  c.resends += 1; c.attempts = 0;
  sendSms(st, c);
  audit(st, "otp.resent", { id });
  return publicChallenge(c);
}

export function cancelChallenge(st, id) {
  const c = getChallenge(st, id);
  if (c.status !== "PENDING") return publicChallenge(c);
  c.status = "CANCELLED";
  const h = handlers[c.payload.type + ":cancel"];
  if (h) h(st, c.payload, "Verification cancelled");
  return publicChallenge(c);
}

/**
 * Returns {ok, status, attemptsLeft, message, result}. Wrong codes are a normal result (not an exception),
 * so the attempt counter is committed even though the action did not run.
 */
export function verifyOtp(st, id, code) {
  const c = getChallenge(st, id);
  if (c.status !== "PENDING") return { ok: false, status: c.status, message: "This request is already closed." };
  if (clock.now().getTime() > Date.parse(c.expiresAt)) {
    c.status = "EXPIRED";
    const h = handlers[c.payload.type + ":cancel"]; if (h) h(st, c.payload, "OTP expired");
    audit(st, "otp.expired", { id });
    return { ok: false, status: "EXPIRED", message: "The OTP has expired. Please start again." };
  }
  if (String(code).trim() !== c.code) {
    c.attempts += 1;
    audit(st, "otp.failed", { id, attempts: c.attempts });
    if (c.attempts >= MAX_ATTEMPTS) {
      c.status = "LOCKED";
      const h = handlers[c.payload.type + ":cancel"]; if (h) h(st, c.payload, "Too many incorrect OTP attempts");
      alert(st, "warn", "Verification locked", `Too many incorrect OTP attempts for: ${c.label}. The request was cancelled for your safety.`);
      return { ok: false, status: "LOCKED", attemptsLeft: 0, message: "Too many incorrect attempts. The request has been cancelled." };
    }
    return { ok: false, status: "PENDING", attemptsLeft: MAX_ATTEMPTS - c.attempts, message: `Incorrect OTP. ${MAX_ATTEMPTS - c.attempts} attempt(s) left.` };
  }
  const h = handlers[c.payload.type];
  if (!h) throw new BankError("Unknown action for this verification");
  c.status = "VERIFIED";
  audit(st, "otp.verified", { id, purpose: c.purpose });
  const result = h(st, c.payload);
  return { ok: true, status: "VERIFIED", result };
}
