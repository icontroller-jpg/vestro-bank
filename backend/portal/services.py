
import hashlib
import json
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from rest_framework.exceptions import APIException

from .models import (
    Account,
    ApprovalItem,
    AuditEvent,
    LedgerEntry,
    Loan,
    RailPolicy,
    Transaction,
    HIGH_VALUE_INR,
    RISK_HOLD_SCORE,
)


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

        body = json.dumps(
            {
                "ts": ts.isoformat(),
                "actor": actor,
                "customer": customer_id,
                "type": type_,
                "severity": severity,
                "detail": detail,
            },
            sort_keys=True,
            default=str,
        )

        AuditEvent.objects.create(
            ts=ts,
            actor=actor,
            customer_id=customer_id,
            type=type_,
            severity=severity,
            detail=detail,
            prev_hash=prev,
            hash=_digest(prev, body),
        )


def verify_audit_chain():
    prev = "0" * 64

    for e in AuditEvent.objects.order_by("id"):
        body = json.dumps(
            {
                "ts": e.ts.isoformat(),
                "actor": e.actor,
                "customer": e.customer_id,
                "type": e.type,
                "severity": e.severity,
                "detail": e.detail,
            },
            sort_keys=True,
            default=str,
        )

        if e.prev_hash != prev or e.hash != _digest(prev, body):
            return False

        prev = e.hash

    return True


# ---------- ledger ----------

def post_entries(tx, debit_id, credit_id, paise):
    """One balanced double entry. Locks both accounts in ID order."""

    locked = {
        a.pk: a
        for a in Account.objects.select_for_update().filter(
            pk__in=sorted({debit_id, credit_id})
        ).order_by("pk")
    }

    if debit_id not in locked or credit_id not in locked:
        raise Fail("Payment account could not be found.")

    d = locked[debit_id]

    if d.kind == "CUSTOMER" and d.balance_paise < paise:
        raise Fail("Insufficient balance.")

    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                transaction=tx,
                account_id=debit_id,
                direction="D",
                amount_paise=paise,
            ),
            LedgerEntry(
                transaction=tx,
                account_id=credit_id,
                direction="C",
                amount_paise=paise,
            ),
        ]
    )

    Account.objects.filter(pk=debit_id).update(
        balance_paise=F("balance_paise") - paise
    )

    Account.objects.filter(pk=credit_id).update(
        balance_paise=F("balance_paise") + paise
    )


def verify_ledger():
    """Returns (debits == credits, number of accounts with cached balance drift)."""

    tot = LedgerEntry.objects.aggregate(
        d=Coalesce(Sum("amount_paise", filter=Q(direction="D")), 0),
        c=Coalesce(Sum("amount_paise", filter=Q(direction="C")), 0),
    )

    drift = 0

    rows = Account.objects.annotate(
        cr=Coalesce(
            Sum("entries__amount_paise", filter=Q(entries__direction="C")),
            0,
        ),
        db=Coalesce(
            Sum("entries__amount_paise", filter=Q(entries__direction="D")),
            0,
        ),
    )

    for a in rows:
        if a.cr - a.db != a.balance_paise:
            drift += 1

    return tot["d"] == tot["c"], drift


# ---------- payments ----------

def _check_existing_payment(
    existing,
    account,
    rail,
    paise,
    beneficiary,
    new_beneficiary,
    destination_account,
):
    # A payment reference must never expose another customer's transaction.
    if (
        existing.customer_id != account.customer_id
        or existing.from_account_id != account.pk
    ):
        raise Fail(
            "This payment reference cannot be used for this account."
        )

    if destination_account is not None:
        destination_matches = (
            existing.to_account_id == destination_account.pk
        )
    else:
        destination_matches = (
            existing.to_account is not None
            and existing.to_account.kind == "GL"
        )

    if (
        existing.rail != rail
        or existing.amount_paise != paise
        or existing.beneficiary != beneficiary
        or existing.new_beneficiary != new_beneficiary
        or not destination_matches
    ):
        raise Fail(
            "This idempotency key was already used for a different payment."
        )

    return existing


def initiate_payment(
    *,
    account,
    rail,
    amount_inr,
    beneficiary,
    new_beneficiary,
    frm_score,
    idempotency_key,
    destination_account=None,
):
    """
    Customer-facing payment entry point.

    Supports ordinary payments to GL accounts and direct transfers
    between customer accounts. Retrying with the same key does not
    move money twice.
    """

    if not idempotency_key or len(idempotency_key) > 64:
        raise Fail("A valid idempotency key is required.")

    try:
        amount = Decimal(str(amount_inr))

        if not amount.is_finite():
            raise Fail("Invalid payment amount.")

        if amount.as_tuple().exponent < -2:
            raise Fail("Payment amount cannot have more than two decimal places.")

        paise = int(amount * 100)

    except (InvalidOperation, TypeError, ValueError):
        raise Fail("Invalid payment amount.")

    if paise <= 0:
        raise Fail("Amount must be positive.")

    try:
        frm_score = int(frm_score)
    except (TypeError, ValueError):
        raise Fail("Invalid fraud risk score.")

    if not 0 <= frm_score <= 100:
        raise Fail("Invalid fraud risk score.")

    if not beneficiary or len(beneficiary) > 80:
        raise Fail("Invalid beneficiary.")

    if not account.customer_id:
        raise Fail("Sender account has no customer owner.")

    existing = (
        Transaction.objects
        .filter(idempotency_key=idempotency_key)
        .select_related(
            "customer",
            "from_account",
            "to_account",
        )
        .first()
    )

    if existing:
        return _check_existing_payment(
            existing,
            account,
            rail,
            paise,
            beneficiary,
            new_beneficiary,
            destination_account,
        )

    with transaction.atomic():

        # Lock and validate the sender.
        sender = (
            Account.objects
            .select_for_update()
            .filter(
                pk=account.pk,
                kind="CUSTOMER",
            )
            .first()
        )

        if not sender:
            raise Fail("Sender account was not found.")

        if sender.customer_id != account.customer_id:
            raise Fail("Sender account ownership has changed.")

        if sender.bank_frozen:
            raise Fail("Account is frozen. Outgoing transfers are blocked.")

        if sender.status != "active":
            raise Fail("Account is not active.")

        if not sender.customer_id:
            raise Fail("Sender account has no customer owner.")

        if sender.balance_paise < paise:
            raise Fail("Insufficient balance.")

        # Resolve the destination.
        if destination_account is not None:

            recipient = (
                Account.objects
                .select_for_update()
                .filter(
                    pk=destination_account.pk,
                    kind="CUSTOMER",
                )
                .first()
            )

            if not recipient or not recipient.customer_id:
                raise Fail("Recipient account was not found.")

            if recipient.pk == sender.pk:
                raise Fail("You cannot transfer money to the same account.")

            if recipient.status != "active":
                raise Fail("Recipient account is not active.")

            if recipient.bank_frozen:
                raise Fail("Recipient account is frozen.")

            destination = recipient

        else:
            destination = gl(rail)

        # Check the payment rail policy.
        policy = RailPolicy.objects.filter(rail=rail).first()

        if policy:
            if not policy.enabled:
                raise Fail(f"{rail} is currently suspended.")

            if paise > policy.max_per_txn * 100:
                raise Fail(
                    f"Amount exceeds the {rail} limit of "
                    f"₹{policy.max_per_txn:,}."
                )

        high = paise >= HIGH_VALUE_INR * 100

        tx = Transaction.objects.create(
            ref=next_ref("PAY", Transaction),
            idempotency_key=idempotency_key,
            rail=rail,
            amount_paise=paise,
            status="PENDING",
            customer=sender.customer,
            from_account=sender,
            to_account=destination,
            beneficiary=beneficiary,
            new_beneficiary=new_beneficiary,
            frm_score=frm_score,
        )

        if high or frm_score >= RISK_HOLD_SCORE:

            tx.status = "HELD"
            tx.save(update_fields=["status"])

            ApprovalItem.objects.create(
                ref=tx.ref,
                kind="payment",
                state="pending_authorise",
                high_value=high,
                transaction=tx,
            )

            audit(
                "payment_held",
                "warn",
                {
                    "ref": tx.ref,
                    "rail": rail,
                    "amount_inr": paise // 100,
                    "frm_score": frm_score,
                },
                sender.customer.code,
            )

        else:

            post_entries(
                tx,
                sender.pk,
                destination.pk,
                paise,
            )

            tx.status = "SUCCESS"
            tx.save(update_fields=["status"])

            audit(
                "payment_completed",
                "info",
                {
                    "ref": tx.ref,
                    "rail": rail,
                    "amount_inr": paise // 100,
                    "recipient_account": (
                        destination.code
                        if destination.kind == "CUSTOMER"
                        else None
                    ),
                },
                sender.customer.code,
            )

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

        if (
            item.state == "authorised"
            and item.authorised_by_id != staff.user_id
            and (rh or not item.high_value)
        ):
            return ["release", "reject"]

        return []

    if item.state == "submitted" and (rh or not item.high_value):
        return ["approve", "reject"]

    return []


def apply_action(ref, staff, action, note=""):
    with transaction.atomic():

        item = (
            ApprovalItem.objects.select_for_update(of=("self",))
            .select_related(
                "transaction__customer",
                "loan_application__customer",
            )
            .filter(ref=ref)
            .first()
        )

        if not item or item.done:
            raise Fail("Item not found or already processed.")

        if action not in item_actions(item, staff):
            raise Fail(
                "That action isn't available to you for this item "
                "(maker-checker rules)."
            )

        user = staff.user
        actor = staff.display_name

        cust = (
            item.transaction.customer.code
            if item.transaction
            else item.loan_application.customer.code
        )

        if action == "authorise":

            item.state, item.authorised_by = "authorised", user

            audit(
                "payment_authorised",
                "info",
                {"ref": ref},
                cust,
                actor,
            )

        elif action == "release":

            tx = item.transaction

            acct = (
                Account.objects
                .select_for_update()
                .filter(pk=tx.from_account_id)
                .first()
            )

            if not acct:
                raise Fail("Cannot release: sender account was not found.")

            if acct.bank_frozen:
                raise Fail("Cannot release: the sender account is frozen.")

            if acct.status != "active":
                raise Fail("Cannot release: the sender account is not active.")

            # Recheck customer recipient eligibility at release time.
            if tx.to_account and tx.to_account.kind == "CUSTOMER":

                recipient = (
                    Account.objects
                    .select_for_update()
                    .filter(pk=tx.to_account_id)
                    .first()
                )

                if not recipient:
                    raise Fail(
                        "Cannot release: recipient account was not found."
                    )

                if recipient.status != "active":
                    raise Fail(
                        "Cannot release: recipient account is not active."
                    )

                if recipient.bank_frozen:
                    raise Fail(
                        "Cannot release: recipient account is frozen."
                    )

            post_entries(
                tx,
                tx.from_account_id,
                tx.to_account_id,
                tx.amount_paise,
            )

            tx.status = "SUCCESS"
            tx.save(update_fields=["status"])

            item.state = "released"
            item.done = True
            item.decided_by = user

            audit(
                "payment_released",
                "info",
                {
                    "ref": ref,
                    "authorised_by": (
                        item.authorised_by.username
                        if item.authorised_by
                        else None
                    ),
                },
                cust,
                actor,
            )

        elif action == "approve":

            la = item.loan_application

            acct = la.customer.accounts.filter(
                status="active",
                bank_frozen=False,
            ).first()

            if not acct:
                raise Fail("Customer has no active account to disburse to.")

            Loan.objects.create(
                customer=la.customer,
                loan_type=la.loan_type,
                amount_paise=la.amount_paise,
            )

            tx = Transaction.objects.create(
                ref=next_ref("DSB", Transaction),
                idempotency_key=f"DISBURSE-{ref}",
                rail="LOAN",
                amount_paise=la.amount_paise,
                status="SUCCESS",
                customer=la.customer,
                from_account=gl("LOANS"),
                to_account=acct,
                beneficiary=la.customer.name,
            )

            post_entries(
                tx,
                tx.from_account_id,
                acct.pk,
                la.amount_paise,
            )

            item.state = "approved"
            item.done = True
            item.decided_by = user

            audit(
                "loan_approved",
                "info",
                {
                    "ref": ref,
                    "amount_inr": la.amount_paise // 100,
                },
                cust,
                actor,
            )

        else:
            # Reject
            if item.transaction:
                item.transaction.status = "REJECTED"
                item.transaction.save(update_fields=["status"])

            item.state = "rejected"
            item.done = True
            item.decided_by = user
            item.note = note[:200]

            audit(
                f"{item.kind}_rejected",
                "warn",
                {"ref": ref, "note": note},
                cust,
                actor,
            )

        item.save()
        return item
