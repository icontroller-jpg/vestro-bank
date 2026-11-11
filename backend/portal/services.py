import hashlib
import json
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import (Account, ApprovalItem, AuditEvent, LedgerEntry, Loan, RailPolicy, Transaction,
                     HIGH_VALUE_INR, RISK_HOLD_SCORE)


class Fail(APIException):
    status_code = 400
    default_detail = "Request could not be processed."


def gl(name):
    return Account.objects.get(code=f"GL-{name}")


def next_ref(prefix, model):
    last = model.objects.order_by("-id").values_list("id", flat=True).first() or 0
    return f"{prefix}-{1001 + last}"


# ---------- audit chain ----------
def _digest(prev, body):
    return hashlib.sha256((prev + body).encode()).hexdigest()


def audit(type_, severity="info", detail=None, customer_id="-", actor=""):
    with transaction.atomic():
        last = AuditEvent.objects.order_by("-id").first()
        prev = last.hash if last else "0" * 64
        ts = timezone.now()
        detail = detail or {}
        body = json.dumps({"ts": ts.isoformat(), "actor": actor, "customer": customer_id, "type": type_, "severity": severity, "detail": detail}, sort_keys=True, default=str)
        AuditEvent.objects.create(ts=ts, actor=actor, customer_id=customer_id, type=type_, severity=severity,
                                  detail=detail, prev_hash=prev, hash=_digest(prev, body))


def verify_audit_chain():
    prev = "0" * 64
    for e in AuditEvent.objects.order_by("id"):
        body = json.dumps({"ts": e.ts.isoformat(), "actor": e.actor, "customer": e.customer_id, "type": e.type, "severity": e.severity, "detail": e.detail}, sort_keys=True, default=str)
        if e.prev_hash != prev or e.hash != _digest(prev, body):
            return False
        prev = e.hash
    return True


# ---------- ledger ----------
def post_entries(tx, debit_id, credit_id, paise):
    """One balanced double entry. Locks both accounts in id order to avoid deadlocks."""
    locked = {a.pk: a for a in Account.objects.select_for_update().filter(pk__in=sorted({debit_id, credit_id}))}
    d = locked[debit_id]
    if d.kind == "CUSTOMER" and d.balance_paise < paise:
        raise Fail("Insufficient balance.")
    LedgerEntry.objects.bulk_create([
        LedgerEntry(transaction=tx, account_id=debit_id, direction="D", amount_paise=paise),
        LedgerEntry(transaction=tx, account_id=credit_id, direction="C", amount_paise=paise),
    ])
    Account.objects.filter(pk=debit_id).update(balance_paise=F("balance_paise") - paise)
    Account.objects.filter(pk=credit_id).update(balance_paise=F("balance_paise") + paise)


def verify_ledger():
    """Returns (debits == credits, number of accounts whose cached balance differs from the ledger)."""
    tot = LedgerEntry.objects.aggregate(
        d=Coalesce(Sum("amount_paise", filter=Q(direction="D")), 0),
        c=Coalesce(Sum("amount_paise", filter=Q(direction="C")), 0))
    drift = 0
    rows = Account.objects.annotate(
        cr=Coalesce(Sum("entries__amount_paise", filter=Q(entries__direction="C")), 0),
        db=Coalesce(Sum("entries__amount_paise", filter=Q(entries__direction="D")), 0))
    for a in rows:
        if a.cr - a.db != a.balance_paise:
            drift += 1
    return tot["d"] == tot["c"], drift


# ---------- payments ----------
def initiate_payment(*, account, rail, amount_inr, beneficiary, new_beneficiary, frm_score, idempotency_key):
    """The customer-facing entry point (the customer portal can call this). Retrying with the same key never moves money twice."""
    existing = Transaction.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing
    paise = int(Decimal(str(amount_inr)) * 100)
    if paise <= 0:
        raise Fail("Amount must be positive.")
    policy = RailPolicy.objects.filter(rail=rail).first()
    if policy:
        if not policy.enabled:
            raise Fail(f"{rail} is currently suspended.")
        if paise > policy.max_per_txn * 100:
            raise Fail(f"Amount exceeds the {rail} limit of ₹{policy.max_per_txn:,}.")
    if account.bank_frozen:
        raise Fail("Account is frozen. Outgoing transfers are blocked.")
    if account.status != "active":
        raise Fail("Account is not active.")
    if account.balance_paise < paise:
        raise Fail("Insufficient balance.")
    high = paise >= HIGH_VALUE_INR * 100
    with transaction.atomic():
        tx = Transaction.objects.create(
            ref=next_ref("PAY", Transaction), idempotency_key=idempotency_key, rail=rail, amount_paise=paise,
            status="PENDING", customer=account.customer, from_account=account, to_account=gl(rail),
            beneficiary=beneficiary, new_beneficiary=new_beneficiary, frm_score=frm_score)
        if high or frm_score >= RISK_HOLD_SCORE:
            tx.status = "HELD"
            tx.save(update_fields=["status"])
            ApprovalItem.objects.create(ref=tx.ref, kind="payment", state="pending_authorise", high_value=high, transaction=tx)
            audit("payment_held", "warn", {"ref": tx.ref, "rail": rail, "amount_inr": paise // 100, "frm_score": frm_score}, account.customer.code)
        else:
            post_entries(tx, account.pk, tx.to_account_id, paise)
            tx.status = "SUCCESS"
            tx.save(update_fields=["status"])
    return tx


# ---------- maker-checker ----------
def item_actions(item, staff):
    """Which actions this staff member may take on this item right now."""
    if item.done:
        return []
    rh = staff.role == "regionhead"
    if item.kind == "payment":
        if item.state == "pending_authorise":
            return ["authorise", "reject"] if (rh or not item.high_value) else []
        if item.state == "authorised" and item.authorised_by_id != staff.user_id and (rh or not item.high_value):
            return ["release", "reject"]
        return []
    if item.state == "submitted" and (rh or not item.high_value):
        return ["approve", "reject"]
    return []


def apply_action(ref, staff, action, note=""):
    with transaction.atomic():
        item = (ApprovalItem.objects.select_for_update(of=("self",))
                .select_related("transaction__customer", "loan_application__customer").filter(ref=ref).first())
        if not item or item.done:
            raise Fail("Item not found or already processed.")
        if action not in item_actions(item, staff):
            raise Fail("That action isn't available to you for this item (maker-checker rules).")
        user = staff.user
        actor = staff.display_name
        cust = item.transaction.customer.code if item.transaction else item.loan_application.customer.code

        if action == "authorise":
            item.state, item.authorised_by = "authorised", user
            audit("payment_authorised", "info", {"ref": ref}, cust, actor)
        elif action == "release":
            tx = item.transaction
            acct = Account.objects.get(pk=tx.from_account_id)
            if acct.bank_frozen:
                raise Fail("Cannot release: the account is frozen.")
            post_entries(tx, tx.from_account_id, tx.to_account_id, tx.amount_paise)
            tx.status = "SUCCESS"
            tx.save(update_fields=["status"])
            item.state, item.done, item.decided_by = "released", True, user
            audit("payment_released", "info", {"ref": ref, "authorised_by": item.authorised_by.username if item.authorised_by else None}, cust, actor)
        elif action == "approve":
            la = item.loan_application
            acct = la.customer.accounts.filter(status="active", bank_frozen=False).first()
            if not acct:
                raise Fail("Customer has no active account to disburse to.")
            Loan.objects.create(customer=la.customer, loan_type=la.loan_type, amount_paise=la.amount_paise)
            tx = Transaction.objects.create(
                ref=next_ref("DSB", Transaction), idempotency_key=f"DISBURSE-{ref}", rail="LOAN", amount_paise=la.amount_paise,
                status="SUCCESS", customer=la.customer, from_account=gl("LOANS"), to_account=acct, beneficiary=la.customer.name)
            post_entries(tx, tx.from_account_id, acct.pk, la.amount_paise)
            item.state, item.done, item.decided_by = "approved", True, user
            audit("loan_approved", "info", {"ref": ref, "amount_inr": la.amount_paise // 100}, cust, actor)
        else:  # reject
            if item.transaction:
                item.transaction.status = "REJECTED"
                item.transaction.save(update_fields=["status"])
            item.state, item.done, item.decided_by, item.note = "rejected", True, user, note[:200]
            audit(f"{item.kind}_rejected", "warn", {"ref": ref, "note": note}, cust, actor)
        item.save()
        return item