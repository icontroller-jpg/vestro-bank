// Debit and credit cards: instant safe controls, OTP for risk-increasing changes, and a purchase simulator.
import { BankError, acct, alert, audit, available, inr, localToday, post, rupees, uid, nowISO, addMonths } from "./util.js";
import { createChallenge } from "./otp.js";

export const CHANNELS = { pos: "In-store (chip & PIN)", contactless: "Contactless tap", online: "Online purchases", intl: "International use" };
export const LIMIT_CAPS = { DEBIT: { pos: rupees(200000), online: rupees(100000), atm: rupees(50000) }, CREDIT: { pos: rupees(200000), online: rupees(200000), atm: rupees(20000) } };

export const card = (st, id) => {
  const c = st.cards.find((x) => x.id === id);
  if (!c) throw new BankError("Card not found");
  return c;
};

export function freeze(st, id, on) {
  const c = card(st, id);
  if (c.status === "BLOCKED") throw new BankError("This card is permanently blocked");
  c.frozen = !!on;
  audit(st, on ? "card.frozen" : "card.unfrozen", { id });
  alert(st, "info", on ? "Card frozen" : "Card unfrozen", `${c.name} ending ${c.last4} is ${on ? "frozen. All new transactions will be declined" : "active again"}.`);
  return c;
}

/** Turning a channel OFF or lowering a limit is safe and instant; turning ON / raising needs an OTP. */
export function requestSetting(st, { cardId, channel, enabled, limit, value }) {
  const c = card(st, cardId);
  if (c.status === "BLOCKED") throw new BankError("This card is permanently blocked");
  if (channel) {
    if (!(channel in CHANNELS)) throw new BankError("Unknown channel");
    if (!enabled) { c.channels[channel] = false; audit(st, "card.channel.off", { id: cardId, channel }); return { applied: true, card: c }; }
    return { challenge: createChallenge(st, "CARD", `enabling ${CHANNELS[channel].toLowerCase()} on card ${c.last4}`, { type: "cardSetting", cardId, channel, enabled: true },
      channel === "intl" ? "International use raises fraud risk. Switch it off again when you return." : "").id };
  }
  if (limit) {
    const cap = LIMIT_CAPS[c.kind][limit];
    if (!cap) throw new BankError("Unknown limit");
    if (!Number.isInteger(value) || value < rupees(1000)) throw new BankError("Enter a limit of at least ₹1,000");
    if (value > cap) throw new BankError(`The highest ${limit.toUpperCase()} limit for this card is ${inr(cap)}`);
    if (value <= c.limits[limit]) { c.limits[limit] = value; audit(st, "card.limit.lowered", { id: cardId, limit, value }); return { applied: true, card: c }; }
    return { challenge: createChallenge(st, "CARD", `raising ${limit.toUpperCase()} limit to ${inr(value)} on card ${c.last4}`, { type: "cardSetting", cardId, limit, value }).id };
  }
  throw new BankError("Nothing to change");
}
export function onCardSetting(st, p) {
  const c = card(st, p.cardId);
  if (p.channel) c.channels[p.channel] = true; else c.limits[p.limit] = p.value;
  audit(st, "card.setting", { id: p.cardId, ...p }); return c;
}

export function requestBlock(st, cardId) {
  const c = card(st, cardId);
  if (c.status === "BLOCKED") throw new BankError("This card is already blocked");
  return createChallenge(st, "CARD", `permanently blocking card ${c.last4}`, { type: "blockCard", cardId }, "A replacement card will be issued to your registered address. This cannot be undone.").id;
}
export function onBlockCard(st, { cardId }) {
  const c = card(st, cardId);
  c.status = "BLOCKED"; c.frozen = true;
  const nc = { ...c, id: uid(st, "CRD"), status: "ISSUED", frozen: true, last4: String(1000 + ((st.seq.CRD * 7919) % 9000)), replaces: c.id, issuedOn: localToday(), channels: { pos: true, contactless: false, online: false, intl: false } };
  st.cards.push(nc);
  audit(st, "card.blocked", { id: cardId, replacement: nc.id });
  alert(st, "warn", "Card blocked", `Card ending ${c.last4} is permanently blocked. A replacement ending ${nc.last4} is on its way and is frozen until you activate it.`);
  return nc;
}
export function activate(st, id) {
  const c = card(st, id);
  if (c.status !== "ISSUED") throw new BankError("This card is already active");
  c.status = "ACTIVE"; c.frozen = false; audit(st, "card.activated", { id }); return c;
}

export function creditAvailable(c) { return c.creditLimit - c.outstanding; }

/** Simulated authorisation. Returns {approved, reason}. */
export function authorise(st, { cardId, merchant, amount, channel, country = "IN", category = "Retail" }) {
  const c = card(st, cardId);
  if (!Number.isInteger(amount) || amount <= 0) throw new BankError("Enter an amount greater than zero");
  const decline = (reason) => {
    st.cardTxns.unshift({ id: uid(st, "CTX"), card: c.id, ts: nowISO(), merchant, category, amount, channel, country, status: "DECLINED", reason });
    audit(st, "card.declined", { id: c.id, reason }); return { approved: false, reason };
  };
  if (c.status === "BLOCKED") return decline("Card is blocked");
  if (c.status === "ISSUED") return decline("Card has not been activated");
  if (c.frozen) return decline("Card is frozen");
  const intl = country !== "IN", key = channel === "ATM" ? null : channel === "TAP" ? "contactless" : channel === "ONLINE" ? "online" : "pos";
  if (intl && !c.channels.intl) return decline("International use is switched off");
  if (key && !c.channels[key]) return decline(`${CHANNELS[key]} is switched off`);
  const lim = channel === "ONLINE" ? c.limits.online : channel === "ATM" ? c.limits.atm : c.limits.pos;
  if (amount > lim) return decline(`Above your ${channel === "ONLINE" ? "online" : channel === "ATM" ? "ATM" : "in-store"} limit of ${inr(lim)}`);
  if (channel === "ONLINE" && amount >= rupees(25000) && !st.settings.deviceTrusted) return decline("Blocked: large online purchase from an unrecognised device");
  if (c.kind === "CREDIT") {
    if (amount > creditAvailable(c)) return decline("Not enough available credit");
    c.outstanding += amount;
  } else {
    try { post(st, c.acc, "DR", amount, `${channel === "ATM" ? "ATM WDL" : channel === "ONLINE" ? "ECOM" : "POS"} ${merchant.toUpperCase()}`, "CARD", { ref: c.id }); }
    catch (e) { return decline(e.code === "FUNDS" ? "Insufficient funds" : e.message); }
  }
  st.cardTxns.unshift({ id: uid(st, "CTX"), card: c.id, ts: nowISO(), merchant, category, amount, channel, country, status: "APPROVED" });
  alert(st, "info", "Card payment", `${inr(amount)} spent at ${merchant} on card ending ${c.last4}.`);
  return { approved: true };
}

export function payCardBill(st, { cardId, accId, amount }) {
  const c = card(st, cardId);
  if (c.kind !== "CREDIT") throw new BankError("Only credit cards have a bill");
  if (!Number.isInteger(amount) || amount <= 0) throw new BankError("Enter an amount greater than zero");
  if (amount > c.outstanding) throw new BankError(`You only owe ${inr(c.outstanding)}`);
  post(st, accId, "DR", amount, `CREDIT CARD BILL PAYMENT ${c.last4}`, "CARD", { ref: c.id });
  c.outstanding -= amount;
  if (c.statement) { c.statement.paid = Math.min(c.statement.amount, (c.statement.paid || 0) + amount); }
  st.cardTxns.unshift({ id: uid(st, "CTX"), card: c.id, ts: nowISO(), merchant: "Payment received", category: "Payment", amount, channel: "PAYMENT", country: "IN", status: "APPROVED", credit: true });
  audit(st, "card.billpaid", { id: c.id, amount });
  return c;
}
void acct; void available; void addMonths;
