from django.conf import settings
from django.db import models
from django.utils import timezone

HIGH_VALUE_INR = 1_000_000          # ₹10 lakh: needs a regional head
RISK_HOLD_SCORE = 75                # FRM score at or above this is held for review
RAILS = ["UPI", "IMPS", "NEFT", "RTGS", "CHEQUE"]
POLICY_RAILS = ["UPI", "IMPS", "NEFT", "RTGS"]   # rails a regional head can control


class Branch(models.Model):
    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=80)
    state = models.CharField(max_length=40)
    kind = models.CharField(max_length=20)


class StaffProfile(models.Model):
    ROLES = [("branchmgr", "Branch manager"), ("regionhead", "Regional head")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portal_staff")
    display_name = models.CharField(max_length=80)
    role = models.CharField(max_length=12, choices=ROLES)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL)

    @property
    def user_id_(self):
        return self.user_id


class Customer(models.Model):
    code = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=80, db_index=True)
    city = models.CharField(max_length=60)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="customers")
    segment = models.CharField(max_length=12)
    kyc_level = models.CharField(max_length=10)      # full | min | pending
    risk_rating = models.CharField(max_length=10)    # low | medium | high


class Account(models.Model):
    """Customer accounts and internal GL accounts. balance_paise is a cache; the ledger is the truth."""
    code = models.CharField(max_length=14, unique=True)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name="accounts")
    number = models.CharField(max_length=16)
    kind = models.CharField(max_length=8, default="CUSTOMER")      # CUSTOMER | GL
    status = models.CharField(max_length=10, default="active")     # active | dormant
    bank_frozen = models.BooleanField(default=False)
    freeze_reason = models.TextField(blank=True)
    balance_paise = models.BigIntegerField(default=0)              # credits minus debits

    @property
    def masked(self):
        return "XXXX XXXX " + self.number[-4:]


class Transaction(models.Model):
    ref = models.CharField(max_length=24, unique=True)
    idempotency_key = models.CharField(max_length=64, unique=True)
    rail = models.CharField(max_length=10, db_index=True)
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=10, db_index=True)        # HELD | SUCCESS | FAILED | REJECTED
    customer = models.ForeignKey(Customer, null=True, on_delete=models.PROTECT, related_name="transactions")
    from_account = models.ForeignKey(Account, null=True, on_delete=models.PROTECT, related_name="+")
    to_account = models.ForeignKey(Account, null=True, on_delete=models.PROTECT, related_name="+")
    beneficiary = models.CharField(max_length=80, blank=True)
    new_beneficiary = models.BooleanField(default=False)
    frm_score = models.IntegerField(default=0)
    failure_reason = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)


class LedgerEntry(models.Model):
    """Append-only double-entry ledger. Corrections are new reversing entries, never edits."""
    transaction = models.ForeignKey(Transaction, on_delete=models.PROTECT, related_name="entries")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="entries")
    direction = models.CharField(max_length=1)                     # D | C
    amount_paise = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Ledger entries are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Ledger entries cannot be deleted.")


class Card(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="cards")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="+")
    blocked = models.BooleanField(default=False)
    online = models.BooleanField(default=True)
    international = models.BooleanField(default=False)


class Deposit(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="deposits")
    principal_paise = models.BigIntegerField()
    tenor_months = models.IntegerField()
    opened_at = models.DateTimeField(default=timezone.now)


class Loan(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="loans")
    loan_type = models.CharField(max_length=12)
    amount_paise = models.BigIntegerField()
    opened_at = models.DateTimeField(default=timezone.now)


class LoanApplication(models.Model):
    ref = models.CharField(max_length=24, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="applications")
    loan_type = models.CharField(max_length=12)
    amount_paise = models.BigIntegerField()
    foir = models.DecimalField(max_digits=4, decimal_places=2)     # EMI burden as a fraction of income
    created_at = models.DateTimeField(default=timezone.now)


class ApprovalItem(models.Model):
    """Maker-checker workflow stored as state, with who did each step."""
    ref = models.CharField(max_length=24, unique=True)
    kind = models.CharField(max_length=8)                          # payment | loan
    state = models.CharField(max_length=24)  # pending_authorise|authorised|released|submitted|approved|rejected
    done = models.BooleanField(default=False, db_index=True)
    high_value = models.BooleanField(default=False)
    transaction = models.ForeignKey(Transaction, null=True, blank=True, on_delete=models.PROTECT)
    loan_application = models.ForeignKey(LoanApplication, null=True, blank=True, on_delete=models.PROTECT)
    authorised_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class RailPolicy(models.Model):
    rail = models.CharField(max_length=10, unique=True)
    enabled = models.BooleanField(default=True)
    max_per_txn = models.BigIntegerField()    # rupees
    ceiling = models.BigIntegerField()        # rupees; a regional head cannot exceed this


class AuditEvent(models.Model):
    """Hash-chained: each row stores the previous row's hash, so edits or deletions are detectable."""
    ts = models.DateTimeField(default=timezone.now, db_index=True)
    actor = models.CharField(max_length=80, blank=True)
    customer_id = models.CharField(max_length=12, default="-")
    type = models.CharField(max_length=40)
    severity = models.CharField(max_length=8, default="info")
    detail = models.JSONField(default=dict)
    prev_hash = models.CharField(max_length=64)
    hash = models.CharField(max_length=64)