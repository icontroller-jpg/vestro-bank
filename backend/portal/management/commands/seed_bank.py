import math
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from portal import services as svc
from portal.models import (Account, ApprovalItem, AuditEvent, Branch, Card, Customer, Deposit, LedgerEntry, Loan,
                           LoanApplication, RailPolicy, StaffProfile, Transaction, HIGH_VALUE_INR)

User = get_user_model()
PASSWORD = "vestro-demo"

BRANCH_SRC = [
    ("Mumbai Fort", "Maharashtra"), ("Pune Camp", "Maharashtra"), ("Nagpur Sadar", "Maharashtra"),
    ("Delhi CP", "Delhi"), ("Delhi Dwarka", "Delhi"), ("Gurugram Sec 29", "Haryana"), ("Faridabad", "Haryana"),
    ("Bengaluru MG Road", "Karnataka"), ("Mysuru", "Karnataka"), ("Hubballi", "Karnataka"),
    ("Chennai T Nagar", "Tamil Nadu"), ("Coimbatore", "Tamil Nadu"), ("Madurai", "Tamil Nadu"),
    ("Hyderabad Banjara Hills", "Telangana"), ("Warangal", "Telangana"),
    ("Kolkata Park Street", "West Bengal"), ("Howrah", "West Bengal"),
    ("Ahmedabad CG Road", "Gujarat"), ("Surat", "Gujarat"), ("Vadodara", "Gujarat"),
    ("Jaipur MI Road", "Rajasthan"), ("Jodhpur", "Rajasthan"),
    ("Lucknow Hazratganj", "Uttar Pradesh"), ("Kanpur", "Uttar Pradesh"), ("Noida Sec 18", "Uttar Pradesh"),
    ("Ludhiana Model Town", "Punjab"), ("Amritsar", "Punjab"), ("Chandigarh Sec 17", "Chandigarh"),
    ("Kochi MG Road", "Kerala"), ("Thiruvananthapuram", "Kerala"),
    ("Bhopal", "Madhya Pradesh"), ("Indore", "Madhya Pradesh"), ("Patna", "Bihar"), ("Bhubaneswar", "Odisha"),
    ("Guwahati", "Assam"), ("Visakhapatnam", "Andhra Pradesh"), ("Vijayawada", "Andhra Pradesh"),
    ("Dehradun", "Uttarakhand"), ("Ranchi", "Jharkhand"),
]
BTYPES = ["Metro", "Urban", "Semi-urban"]
FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Rohan", "Kabir", "Ishaan", "Zoya", "Ananya", "Diya", "Meera", "Saanvi", "Priya", "Neha", "Kavya", "Rahul", "Amit", "Sneha", "Pooja", "Vikram", "Farhan", "Simran", "Harpreet", "Gurpreet", "Tanvi", "Nikhil", "Sanjay", "Deepa", "Lakshmi", "Suresh"]
LAST = ["Mehta", "Sharma", "Khan", "Patel", "Singh", "Iyer", "Reddy", "Nair", "Gupta", "Das", "Banerjee", "Joshi", "Kapoor", "Verma", "Chopra", "Bhat", "Menon", "Gill", "Malhotra", "Rao"]
SEGMENTS = ["Retail"] * 4 + ["Premier"] * 2 + ["Private", "SME"]
MULT = {"Retail": 1, "Premier": 3, "Private": 8, "SME": 2}
LOAN_TYPES = {"Home": (2_500_000, 9_000_000), "Personal": (100_000, 1_500_000), "Auto": (400_000, 1_800_000),
              "Business": (500_000, 6_000_000), "Education": (300_000, 2_500_000)}
POLICY = {"UPI": (100_000, 100_000), "IMPS": (500_000, 500_000), "NEFT": (5_000_000, 10_000_000), "RTGS": (50_000_000, 100_000_000)}
RAIL_W = [("UPI", 62), ("IMPS", 14), ("NEFT", 10), ("RTGS", 2), ("CHEQUE", 12)]
AMT = {"UPI": (50, 100_000), "IMPS": (500, 500_000), "NEFT": (1_000, 2_500_000), "RTGS": (200_000, 20_000_000), "CHEQUE": (1_000, 500_000)}
FAIL_REASONS = ["Beneficiary bank timeout", "Invalid IFSC", "Daily limit exceeded", "Insufficient funds"]
PAYEES = ["Zoya Khan", "Ravi Traders", "Sunrise Exports", "Meera Constructions", "Patel Logistics", "Gill Agro", "Iyer & Sons"]
STAFF = [("priya.nair", "Priya Nair", "branchmgr", "BR001"), ("rohit.menon", "Rohit Menon", "branchmgr", "BR008"),
         ("meera.kapoor", "Meera Kapoor", "regionhead", None)]


class Command(BaseCommand):
    help = "Seed the synthetic Vestro bank (fictional customers, no real data)."

    def add_arguments(self, p):
        p.add_argument("--reset", action="store_true", help="wipe portal data first")
        p.add_argument("--customers", type=int, default=1200)
        p.add_argument("--transactions", type=int, default=5000)
        p.add_argument("--seed", type=int, default=20261103)

    def wipe(self):
        User.objects.filter(portal_staff__isnull=False).delete()
        for m in [AuditEvent, ApprovalItem, LedgerEntry, LoanApplication, Loan, Deposit, Card, Transaction,
                  Account, Customer, RailPolicy, StaffProfile, Branch]:
            m.objects.all().delete()

    @transaction.atomic
    def handle(self, *args, **o):
        if Branch.objects.exists() and not o["reset"]:
            raise CommandError("Bank already seeded. Use --reset to rebuild.")
        if o["reset"]:
            self.wipe()
        random.seed(o["seed"])
        now = timezone.now()

        # branches, staff, policy, GL accounts
        Branch.objects.bulk_create([Branch(code=f"BR{i + 1:03d}", name=f"Vestro {n}", state=s, kind=BTYPES[i % 3]) for i, (n, s) in enumerate(BRANCH_SRC)])
        branches = list(Branch.objects.order_by("code"))
        bycode = {b.code: b for b in branches}
        for username, name, role, br in STAFF:
            u, _ = User.objects.get_or_create(username=username)
            u.set_password(PASSWORD)
            u.save()
            StaffProfile.objects.create(user=u, display_name=name, role=role, branch=bycode.get(br))
        for rail, (mx, ceil) in POLICY.items():
            RailPolicy.objects.create(rail=rail, max_per_txn=mx, ceiling=ceil)
        gls = {}
        for i, name in enumerate(["OPENING", "LOANS", "UPI", "IMPS", "NEFT", "RTGS", "CHEQUE"]):
            gls[name] = Account.objects.create(code=f"GL-{name}", customer=None, number=f"900000{i:06d}", kind="GL")

        # customers and accounts
        Customer.objects.bulk_create([
            Customer(code=f"C{i:05d}", name=f"{random.choice(FIRST)} {random.choice(LAST)}",
                     city="", branch=branches[min(len(branches) - 1, int(random.random() ** 1.4 * len(branches)))],
                     segment=random.choice(SEGMENTS),
                     kyc_level=random.choices(["full", "min", "pending"], [82, 12, 6])[0],
                     risk_rating=random.choices(["low", "medium", "high"], [72, 21, 7])[0])
            for i in range(1, o["customers"] + 1)])
        customers = list(Customer.objects.select_related("branch").order_by("code"))
        for c in customers:
            c.city = c.branch.name.replace("Vestro ", "").split(" ")[0]
        Customer.objects.bulk_update(customers, ["city"], batch_size=500)

        seq, new_accts = 1, []
        for c in customers:
            for _ in range(random.randint(1, 3)):
                new_accts.append(Account(code=f"AC{seq:06d}", customer=c, number="".join(random.choices("0123456789", k=12)),
                                         status="dormant" if random.random() < 0.08 else "active"))
                seq += 1
        Account.objects.bulk_create(new_accts, batch_size=500)
        accounts = list(Account.objects.filter(kind="CUSTOMER").select_related("customer"))

        # opening balances: one balanced batch (credit every account, one aggregate debit to GL-OPENING)
        t0 = now - timedelta(days=WINDOW + 1) if (WINDOW := 30) else now
        bal = {}
        for a in accounts:
            bal[a.id] = int(math.exp(9 + random.random() * 5.5) * 100 * MULT[a.customer.segment])
        total_open = sum(bal.values())
        opening = Transaction.objects.create(ref="OPENING-0001", idempotency_key="seed-opening", rail="OPENING", amount_paise=total_open,
                                             status="SUCCESS", created_at=t0)
        entries = [LedgerEntry(transaction=opening, account_id=aid, direction="C", amount_paise=p, created_at=t0) for aid, p in bal.items()]
        entries.append(LedgerEntry(transaction=opening, account_id=gls["OPENING"].id, direction="D", amount_paise=total_open, created_at=t0))
        gl_bal = {g.id: 0 for g in gls.values()}
        gl_bal[gls["OPENING"].id] = -total_open

        # historical transactions (balanced; failed ones post nothing)
        active = [a for a in accounts if a.status == "active"]
        rails, weights = zip(*RAIL_W)
        sim, made, tries = [], 0, 0
        while made < o["transactions"] and tries < o["transactions"] * 8:
            tries += 1
            a, rail = random.choice(active), random.choices(rails, weights)[0]
            lo, hi = AMT[rail]
            rupees = int(lo + (hi - lo) * random.random() ** 3)
            if rupees > bal[a.id] / 100 * 0.4 or rupees < lo:
                continue
            made += 1
            failed = random.random() < 0.03
            ts = now - timedelta(seconds=random.randint(0, WINDOW * 86400))
            sim.append((Transaction(
                ref=f"SIM-{made:06d}", idempotency_key=f"seed-{made}", rail=rail, amount_paise=rupees * 100,
                status="FAILED" if failed else "SUCCESS", customer=a.customer, from_account=a, to_account=gls[rail],
                beneficiary=random.choice(PAYEES), new_beneficiary=random.random() < 0.1,
                frm_score=min(99, int(random.betavariate(1.5, 8) * 100)),
                failure_reason=random.choice(FAIL_REASONS) if failed else "", created_at=ts), a.id, rail, failed))
            if not failed:
                bal[a.id] -= rupees * 100
                gl_bal[gls[rail].id] += rupees * 100
        Transaction.objects.bulk_create([s[0] for s in sim], batch_size=500)
        ids = {t.ref: t.id for t in Transaction.objects.filter(ref__startswith="SIM-").only("id", "ref")}
        for tx, aid, rail, failed in sim:
            if failed:
                continue
            tid = ids[tx.ref]
            entries.append(LedgerEntry(transaction_id=tid, account_id=aid, direction="D", amount_paise=tx.amount_paise, created_at=tx.created_at))
            entries.append(LedgerEntry(transaction_id=tid, account_id=gls[rail].id, direction="C", amount_paise=tx.amount_paise, created_at=tx.created_at))
        LedgerEntry.objects.bulk_create(entries, batch_size=1000)

        for a in accounts:
            a.balance_paise = bal[a.id]
        Account.objects.bulk_update(accounts, ["balance_paise"], batch_size=500)
        for g in gls.values():
            g.balance_paise = gl_bal[g.id]
        Account.objects.bulk_update(list(gls.values()), ["balance_paise"])

        # cards, deposits, loans
        first_acct = {}
        for a in accounts:
            first_acct.setdefault(a.customer_id, a)
        Card.objects.bulk_create([Card(customer=c, account=first_acct[c.id], blocked=random.random() < 0.03,
                                       online=random.random() < 0.85, international=random.random() < 0.35)
                                  for c in customers if random.random() < 0.7])
        Deposit.objects.bulk_create([Deposit(customer=c, principal_paise=int(math.exp(11 + random.random() * 3) * 100),
                                             tenor_months=random.choice([6, 12, 24, 36, 60]))
                                     for c in customers if random.random() < 0.2])
        loans = []
        for c in customers:
            if random.random() < 0.22:
                t = random.choice(list(LOAN_TYPES))
                lo, hi = LOAN_TYPES[t]
                loans.append(Loan(customer=c, loan_type=t, amount_paise=int(lo + random.random() * (hi - lo)) * 100))
        Loan.objects.bulk_create(loans)

        # approval queue: held payments go through the real payment path, loans are applications
        rich = list(Account.objects.filter(kind="CUSTOMER", status="active").order_by("-balance_paise")[:12])
        specs = [("UPI", 40_000, "refund.desk@vstb", True, 88), ("IMPS", 350_000, "Ravi Traders", True, 79),
                 ("NEFT", 1_250_000, "Sunrise Exports", False, 31), ("RTGS", 2_500_000, "Meera Constructions", True, 64),
                 ("NEFT", 875_000, "Patel Logistics", False, 82)]
        for i, (rail, amt, who, new, score) in enumerate(specs):
            try:
                svc.initiate_payment(account=rich[i], rail=rail, amount_inr=amt, beneficiary=who, new_beneficiary=new,
                                     frm_score=score, idempotency_key=f"seed-queue-{i}")
            except svc.Fail as e:
                self.stderr.write(f"queue payment {i} skipped: {e.detail}")
        for typ, amt, foir in [("Home", 6_500_000, .41), ("Personal", 450_000, .58), ("Business", 2_200_000, .47), ("Auto", 900_000, .36)]:
            c = random.choice(customers)
            la = LoanApplication.objects.create(ref=svc.next_ref("LN", LoanApplication), customer=c, loan_type=typ, amount_paise=amt * 100, foir=foir)
            ApprovalItem.objects.create(ref=la.ref, kind="loan", state="submitted", high_value=amt >= HIGH_VALUE_INR, loan_application=la)

        for t, sev in [("kyc_updated", "info"), ("card_blocked", "warn"), ("login_failed", "warn"), ("kyc_updated", "info")]:
            svc.audit(t, sev, {"note": "synthetic activity"}, random.choice(customers).code, "system")

        balanced, drift = svc.verify_ledger()
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(customers)} customers, {len(accounts)} accounts, {made} transactions, {len(entries)} ledger entries.\n"
            f"Ledger balanced: {balanced} · accounts with cache drift: {drift} · audit chain intact: {svc.verify_audit_chain()}\n"
            f"Staff logins (password '{PASSWORD}'): " + ", ".join(s[0] for s in STAFF)))