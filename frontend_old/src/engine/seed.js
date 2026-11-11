// Builds a believable, fully fictional retail customer: six months of ledger history, loans, deposits, cards, payees.
import { addDays, addMonths, clock, dayDiff, localToday, mask, rand, randInt, pick, rupees, uid } from "./util.js";
import { emi, schedule } from "./loans.js";
import { depositRate, fdMaturity, rdMaturity } from "./deposits.js";

const pad = (n) => String(n).padStart(2, "0");
const at = (date, hh, mm) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };

const GROCERS = ["FreshMart Grocers", "Daily Basket", "Green Valley Organics", "Corner Kirana Store"];
const FOOD = ["Spice Route Café", "Tandoor Tales", "The Bean Counter", "Noodle Junction", "Sweet Tooth Bakery"];
const MISC = ["CityRide Cabs", "Greenleaf Pharmacy", "PageTurn Books", "Metro Smart Card", "Urban Salon"];
const CARD_SHOPS = [["Skyline Electronics", "Electronics"], ["StyleHub Fashion", "Fashion"], ["BlueSky Airlines", "Travel"], ["Harbour View Hotels", "Travel"], ["StreamBox", "Entertainment"],
  ["FreshMart Grocers", "Grocery"], ["Spice Route Café", "Dining"], ["PowerFuel Station", "Fuel"], ["Lumen Power Bill", "Utilities"], ["HomeNest Furnishing", "Home"]];

export function createSeedState(seed = 2026) {
  const today = localToday(), now = clock.now();
  const st = { v: 3, seed, rng: seed | 0, seq: {}, session: { active: false }, settings: { deviceTrusted: true }, challenges: [], sms: [], alerts: [], audit: [],
    accounts: [], txns: [], beneficiaries: [], payments: [], deposits: [], loans: [], offers: [], cards: [], cardTxns: [] };

  st.customer = { id: "CUST-100234", userId: "aarav.mehta", name: "Aarav Mehta", mobile: "+91 98•••••221", email: "aarav.mehta@example.in", kyc: "Full KYC", segment: "Premier",
    branch: "Model Town, Ludhiana", since: addMonths(today, -61), creditScore: 762, monthlyIncome: rupees(240000), pan: "ABCPM••••K" };

  st.accounts.push(
    { id: "ACC-SAV", type: "SAVINGS", number: "50100234781902", ifsc: "VSTB0000112", branch: "Model Town, Ludhiana", balance: rupees(240000), hold: 0, status: "ACTIVE", dailyLimit: rupees(500000), maxDailyLimit: rupees(1000000), rate: 3.0 },
    { id: "ACC-CUR", type: "CURRENT", number: "50200234556071", ifsc: "VSTB0000112", branch: "Model Town, Ludhiana", balance: rupees(50000), hold: 0, status: "ACTIVE", dailyLimit: rupees(1000000), maxDailyLimit: rupees(2500000), rate: 0 });

  // ---- loans (so EMIs can appear in the ledger)
  const mkLoan = (product, label, principal, rate, months, dueDay, paidCount, acc) => {
    const [y, m, d] = today.split("-").map(Number);
    let last = `${y}-${pad(m)}-${pad(dueDay)}`; if (last > today) last = addMonths(last, -1);
    const first = addMonths(last, -(paidCount - 1)), e = emi(principal, rate, months);
    const rows = schedule(principal, rate, months, first, e);
    rows.forEach((r, i) => { if (i < paidCount) { r.status = "PAID"; r.paidOn = r.due; } });
    return { id: uid(st, "LN"), product, label, principal, rate, months, emi: e, start: addMonths(first, -1), acc, status: "ACTIVE", number: "LN" + String(7000000 + st.seq.LN * 389), schedule: rows, dueDay };
  };
  const home = mkLoan("HOME", "Home loan", rupees(3800000), 8.4, 240, 5, 26, "ACC-SAV");
  const pers = mkLoan("PERSONAL", "Personal loan", rupees(400000), 12.0, 36, 12, 10, "ACC-SAV");
  st.loans.push(home, pers);

  // ---- ledger: day by day for 180 days
  const start = addDays(today, -180), bal = { "ACC-SAV": rupees(240000), "ACC-CUR": rupees(50000) };
  const accOf = (id) => st.accounts.find((a) => a.id === id);
  accOf("ACC-SAV").balance = bal["ACC-SAV"]; accOf("ACC-CUR").balance = bal["ACC-CUR"];
  const nowMs = now.getTime();
  const book = (accId, date, hh, kind, amount, desc, mode) => {
    const ts = at(date, hh, randInt(st, 0, 59));
    if (Date.parse(ts) > nowMs) return;
    const a = accOf(accId);
    if (kind === "DR" && a.balance - amount < rupees(15000)) return;
    a.balance += kind === "DR" ? -amount : amount;
    st.txns.push({ id: uid(st, "TXN"), acc: accId, ts, kind, amount, bal: a.balance, desc, mode, ref: "VST" + randInt(st, 10 ** 11, 10 ** 12 - 1) });
  };
  const cardSpends = [];
  for (let i = 0; i <= 180; i++) {
    const date = addDays(start, i), dom = Number(date.slice(8)), month = Number(date.slice(5, 7));
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dom === 1) { book("ACC-SAV", date, 9, "CR", rupees(192000), "NEFT CR SALARY NORTHWIND ANALYTICS PVT LTD", "NEFT"); if ([1, 4, 7, 10].includes(month)) book("ACC-SAV", date, 6, "CR", rupees(randInt(st, 1800, 2600)), "INT.PD SAVINGS INTEREST", "INT"); }
    if (dom === 3) book("ACC-SAV", date, 10, "DR", rupees(32000), "NEFT DR MEERA IYER RENT", "NEFT");
    if (dom === 5) book("ACC-SAV", date, 7, "DR", home.emi, `NACH DR HOME LOAN EMI ${home.number}`, "LOAN");
    if (dom === 7) book("ACC-SAV", date, 8, "DR", rupees(10000), "RD INSTALMENT RD00001", "DEPOSIT");
    if (dom === 9) book("ACC-SAV", date, 12, "DR", rupees(randInt(st, 1800, 3200)), "BBPS LUMEN POWER BILL", "BBPS");
    if (dom === 10) book("ACC-SAV", date, 12, "DR", rupees(1179), "BBPS AIRNET BROADBAND", "BBPS");
    if (dom === 12) book("ACC-SAV", date, 7, "DR", pers.emi, `NACH DR PERSONAL LOAN EMI ${pers.number}`, "LOAN");
    if (dom === 14) book("ACC-SAV", date, 17, "DR", rupees(10000), "ATM WDL MODEL TOWN", "CARD");
    if (dom === 15) { const amt = cardSpends.filter((s) => !s.pay && s.month === (month === 1 ? 12 : month - 1)).reduce((a, s) => a + s.amount, 0); if (amt) { book("ACC-SAV", date, 11, "DR", amt, "CREDIT CARD BILL PAYMENT 7730", "CARD"); cardSpends.push({ month, amount: -amt, ts: at(date, 11, 0), pay: true }); } }
    if (dom === 20) book("ACC-SAV", date, 12, "DR", rupees(599), "UPI MOBILE RECHARGE", "UPI");
    if (rand(st) < 0.6) { const r = rand(st); const name = r < 0.4 ? pick(st, GROCERS) : r < 0.8 ? pick(st, FOOD) : pick(st, MISC); book("ACC-SAV", date, randInt(st, 9, 21), "DR", rupees(randInt(st, 80, 1800)), `UPI/${name}`.toUpperCase(), "UPI"); }
    if (dow === 6 && rand(st) < 0.5) book("ACC-SAV", date, 19, "DR", rupees(randInt(st, 900, 4200)), `UPI/${pick(st, FOOD)}`.toUpperCase(), "UPI");
    // credit card spends
    if (rand(st) < 0.34) { const [m, cat] = pick(st, CARD_SHOPS); const big = rand(st) < 0.07; cardSpends.push({ month, amount: rupees(big ? randInt(st, 12000, 24000) : randInt(st, 250, 5200)), merchant: m, category: cat, ts: at(date, randInt(st, 9, 22), randInt(st, 0, 59)), date }); }
    // current account
    if (rand(st) < 0.045) book("ACC-CUR", date, 15, "CR", rupees(randInt(st, 15000, 60000)), `NEFT CR ${pick(st, ["ORION DESIGN STUDIO", "BLUEFIN LOGISTICS", "KAVERI HANDLOOMS", "TRIDENT CONSULTING"])}`, "NEFT");
    if (rand(st) < 0.07) book("ACC-CUR", date, 16, "DR", rupees(randInt(st, 5000, 22000)), `NEFT DR ${pick(st, ["VENDOR PRINTWORKS", "CLOUDHOST SERVICES", "OFFICE SUPPLIES CO"])}`, "NEFT");
    if (dom === 20) book("ACC-CUR", date, 14, "DR", rupees(12000), "GST PAYMENT CHALLAN", "TAX");
  }
  st.txns.sort((a, b) => a.ts.localeCompare(b.ts));
  // recompute running balances from opening so the statement ties out exactly
  const run = { "ACC-SAV": rupees(240000), "ACC-CUR": rupees(50000) };
  for (const t of st.txns) { run[t.acc] += t.kind === "CR" ? t.amount : -t.amount; t.bal = run[t.acc]; }
  accOf("ACC-SAV").balance = run["ACC-SAV"]; accOf("ACC-CUR").balance = run["ACC-CUR"];
  accOf("ACC-SAV").openedOn = addMonths(today, -61);

  // ---- deposits
  const fdStart = addMonths(today, -5), fd2Start = addMonths(today, -14);
  st.deposits.push(
    { id: uid(st, "FD"), kind: "FD", acc: "ACC-SAV", principal: rupees(200000), months: 12, rate: depositRate(12), start: fdStart, maturityDate: addMonths(fdStart, 12), maturityValue: fdMaturity(rupees(200000), 12), status: "ACTIVE", number: "FD5000137" },
    { id: uid(st, "FD"), kind: "FD", acc: "ACC-SAV", principal: rupees(100000), months: 36, rate: depositRate(36), start: fd2Start, maturityDate: addMonths(fd2Start, 36), maturityValue: fdMaturity(rupees(100000), 36), status: "ACTIVE", number: "FD5000274" });
  const rdStart = addMonths(today, -6); const [yy, mm] = today.split("-").map(Number);
  let lastRd = `${yy}-${pad(mm)}-07`; if (lastRd > today) lastRd = addMonths(lastRd, -1);
  const rdPaid = Math.max(1, Math.round(dayDiff(rdStart, lastRd) / 30) + 1);
  st.deposits.push({ id: uid(st, "RD"), kind: "RD", acc: "ACC-SAV", installment: rupees(10000), months: 24, rate: depositRate(24), start: addMonths(lastRd, -(rdPaid - 1)), maturityDate: addMonths(lastRd, 24 - rdPaid), maturityValue: rdMaturity(rupees(10000), 24),
    paid: rdPaid, nextDue: addMonths(lastRd, 1), status: "ACTIVE", number: "RD6000211" });

  // ---- payees
  const ago = (h) => new Date(nowMs - h * 36e5).toISOString();
  st.beneficiaries.push(
    { id: uid(st, "BEN"), kind: "ACCOUNT", name: "Meera Iyer", nick: "Landlord", acct: "62011458830", ifsc: "HRBK0004410", bank: "Other bank", addedAt: ago(24 * 170) },
    { id: uid(st, "BEN"), kind: "ACCOUNT", name: "Kabir Sethi", nick: "Brother", acct: "50100778234410", ifsc: "VSTB0000931", bank: "Vestro Bank", addedAt: ago(24 * 400) },
    { id: uid(st, "BEN"), kind: "UPI", name: "Kiran Dairy", nick: "Milk vendor", vpa: "kiran.dairy@vstb", addedAt: ago(24 * 90) },
    { id: uid(st, "BEN"), kind: "ACCOUNT", name: "Zoya Khan", nick: "New, added today", acct: "30998821045", ifsc: "MHCB0001205", bank: "Other bank", addedAt: ago(3) });

  // ---- cards
  const monthOf = (d) => Number(d.slice(5, 7));
  const thisM = monthOf(today), prevM = thisM === 1 ? 12 : thisM - 1;
  const spends = cardSpends.filter((s) => !s.pay && Date.parse(s.ts) <= nowMs);
  const cardCredit = cardSpends.filter((s) => s.pay);
  const prevTotal = spends.filter((s) => s.month === prevM).reduce((a, s) => a + s.amount, 0);
  const thisTotal = spends.filter((s) => s.month === thisM).reduce((a, s) => a + s.amount, 0);
  const paidThis = -cardCredit.filter((s) => s.month === thisM && Date.parse(s.ts) <= nowMs).reduce((a, s) => a + s.amount, 0);
  const stmtDue = `${today.slice(0, 8)}20`;
  const outstanding = Math.max(0, prevTotal - paidThis) + thisTotal;
  st.cards.push(
    { id: uid(st, "CRD"), kind: "DEBIT", network: "RuPay", name: "Vestro Platinum Debit", holder: "AARAV MEHTA", last4: "4821", acc: "ACC-SAV", status: "ACTIVE", frozen: false, expiry: "09/29", issuedOn: addMonths(today, -20),
      channels: { pos: true, contactless: true, online: true, intl: false }, limits: { pos: rupees(100000), online: rupees(50000), atm: rupees(40000) } },
    { id: uid(st, "CRD"), kind: "CREDIT", network: "Visa", name: "Vestro Rewards Credit", holder: "AARAV MEHTA", last4: "7730", acc: "ACC-SAV", status: "ACTIVE", frozen: false, expiry: "03/30", issuedOn: addMonths(today, -30),
      creditLimit: rupees(200000), outstanding, statement: { amount: prevTotal, dueDate: stmtDue, minDue: Math.round(prevTotal * 0.05), paid: Math.min(prevTotal, paidThis) },
      channels: { pos: true, contactless: true, online: true, intl: false }, limits: { pos: rupees(150000), online: rupees(100000), atm: rupees(10000) } });
  for (const s of spends.filter((x) => x.month === thisM || x.month === prevM).slice(-30).reverse())
    st.cardTxns.push({ id: uid(st, "CTX"), card: "CRD00002", ts: s.ts, merchant: s.merchant, category: s.category, amount: s.amount, channel: "POS", country: "IN", status: "APPROVED" });
  st.cardTxns.sort((a, b) => b.ts.localeCompare(a.ts));

  st.alerts.push(
    { id: uid(st, "ALT"), ts: ago(3), level: "info", title: "Payee added", text: "Zoya Khan was added. Payments to new payees are capped at ₹50,000 for 24 hours.", read: false },
    { id: uid(st, "ALT"), ts: ago(30), level: "info", title: "Salary credited", text: "A salary credit was posted to your savings account.", read: true });
  void mask;
  return st;
}
