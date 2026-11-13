
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import authenticate
from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken

from .models import (
    CustomerAccess,
    Account,
    ApprovalItem,
    AuditEvent,
    Branch,
    Card,
    Customer,
    Deposit,
    Loan,
    RailPolicy,
    StaffProfile,
    Transaction,
    HIGH_VALUE_INR,
    POLICY_RAILS,
    RAILS,
    RISK_HOLD_SCORE,
)

from .services import (
    Fail,
    apply_action,
    audit,
    item_actions,
    initiate_payment,
)


WINDOW_DAYS = 30

ONLINE_RAILS = {"UPI", "IMPS", "NEFT", "RTGS"}


def user_dict(s):
    return {
        "username": s.user.username,
        "name": s.display_name,
        "role": s.role,
    }


class StaffView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)

        staff = getattr(request.user, "portal_staff", None)

        if staff is None:
            raise PermissionDenied("Staff access only.")

        self.staff = staff


# ============================================================
# PUBLIC
# ============================================================

class Demo(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if not getattr(
            settings,
            "PORTAL_DEMO_MODE",
            settings.DEBUG,
        ):
            return Response({"staff": []})

        return Response({
            "staff": [
                user_dict(s)
                for s in StaffProfile.objects
                .select_related("user")
                .order_by("role", "display_name")
            ]
        })


class Login(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            username=request.data.get("username", ""),
            password=request.data.get("password", ""),
        )

        staff = getattr(user, "portal_staff", None) if user else None

        if not user or not user.is_active:
            raise AuthenticationFailed(
                "Invalid user ID or password."
            )

        if staff is None:
            raise PermissionDenied(
                "This is the staff console. Customers use the customer portal."
            )

        token = AccessToken.for_user(user)
        token.set_exp(lifetime=timedelta(hours=8))

        audit(
            "staff_login",
            "info",
            {},
            "-",
            staff.display_name,
        )

        return Response({
            "token": str(token),
            "user": user_dict(staff),
        })


# ============================================================
# STAFF
# ============================================================

class Me(StaffView):
    def get(self, request):
        return Response({
            "user": user_dict(self.staff),
        })


# ============================================================
# CUSTOMER PORTAL
# ============================================================

class CustomerLogin(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(
            request.data.get("username", "")
        ).strip()

        password = request.data.get("password", "")

        user = authenticate(
            username=username,
            password=password,
        )

        if not user or not user.is_active:
            raise AuthenticationFailed(
                "Invalid user ID or password."
            )

        access = getattr(
            user,
            "portal_customer",
            None,
        )

        if access is None:
            raise PermissionDenied(
                "This account does not have customer portal access."
            )

        if getattr(user, "portal_staff", None) is not None:
            raise PermissionDenied(
                "Use the institution staff portal for this account."
            )

        token = AccessToken.for_user(user)
        token.set_exp(lifetime=timedelta(hours=8))

        return Response({
            "token": str(token),
            "customer": {
                "code": access.customer.code,
                "name": access.customer.name,
            },
        })


class CustomerView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)

        access = getattr(
            request.user,
            "portal_customer",
            None,
        )

        if access is None:
            raise PermissionDenied(
                "Customer portal access only."
            )

        if getattr(request.user, "portal_staff", None) is not None:
            raise PermissionDenied(
                "Staff accounts cannot use customer endpoints."
            )

        self.customer = access.customer


class CustomerDashboard(CustomerView):

    def get(self, request):

        accounts = Account.objects.filter(
            customer=self.customer,
            kind="CUSTOMER",
        ).order_by("code")

        # Include transactions sent by this customer and transactions
        # received into this customer's accounts.
        transactions = (
            Transaction.objects
            .filter(
                Q(customer=self.customer)
                | Q(from_account__customer=self.customer)
                | Q(to_account__customer=self.customer)
            )
            .select_related(
                "from_account__customer",
                "to_account__customer",
                "customer",
            )
            .distinct()
            .order_by("-created_at")[:50]
        )

        cards = (
            Card.objects
            .filter(customer=self.customer)
            .select_related("account")
            .order_by("id")
        )

        deposits = Deposit.objects.filter(
            customer=self.customer
        ).order_by("-opened_at")

        loans = Loan.objects.filter(
            customer=self.customer
        ).order_by("-opened_at")

        transaction_data = []

        for tx in transactions:

            outgoing = (
                tx.from_account is not None
                and tx.from_account.customer_id == self.customer.pk
            )

            incoming = (
                tx.to_account is not None
                and tx.to_account.customer_id == self.customer.pk
            )

            if outgoing:
                direction = "outgoing"
                counterparty_account = tx.to_account
            elif incoming:
                direction = "incoming"
                counterparty_account = tx.from_account
            else:
                direction = "other"
                counterparty_account = None

            counterparty = (
                counterparty_account.masked
                if counterparty_account
                else tx.beneficiary
            )

            counterparty_name = (
                counterparty_account.customer.name
                if (
                    counterparty_account
                    and counterparty_account.customer_id
                )
                else tx.beneficiary
            )

            transaction_data.append({
                "ref": tx.ref,
                "rail": tx.rail,
                "amount_paise": tx.amount_paise,
                "status": tx.status,
                "beneficiary": tx.beneficiary,
                "failure_reason": tx.failure_reason,
                "from_account": (
                    tx.from_account.masked
                    if tx.from_account else None
                ),
                "to_account": (
                    tx.to_account.masked
                    if tx.to_account else None
                ),
                "direction": direction,
                "counterparty": counterparty,
                "counterparty_name": counterparty_name,
                "created_at": tx.created_at.isoformat(),
            })

        return Response({

            "customer": {
                "code": self.customer.code,
                "name": self.customer.name,
                "city": self.customer.city,
                "segment": self.customer.segment,
                "kyc_level": self.customer.kyc_level,
                "risk_rating": self.customer.risk_rating,
            },

            "accounts": [
                {
                    "code": account.code,
                    "masked": account.masked,
                    "kind": account.kind,
                    "status": account.status,
                    "bank_frozen": account.bank_frozen,
                    "freeze_reason": account.freeze_reason,
                    "balance_paise": account.balance_paise,
                }
                for account in accounts
            ],

            "transactions": transaction_data,

            "cards": [
                {
                    "masked_account": card.account.masked,
                    "blocked": card.blocked,
                    "online": card.online,
                    "international": card.international,
                }
                for card in cards
            ],

            "deposits": [
                {
                    "principal_paise": deposit.principal_paise,
                    "tenor_months": deposit.tenor_months,
                    "opened_at": deposit.opened_at.isoformat(),
                }
                for deposit in deposits
            ],

            "loans": [
                {
                    "loan_type": loan.loan_type,
                    "amount_paise": loan.amount_paise,
                    "opened_at": loan.opened_at.isoformat(),
                }
                for loan in loans
            ],

        })


# ============================================================
# CUSTOMER PAYMENTS
# ============================================================

def customer_fraud_score(customer, amount, rail, new_beneficiary):
    """
    Synthetic rule-based risk score for this demonstration portal.
    This is not a production fraud model.
    """

    score = {
        "low": 10,
        "medium": 35,
        "high": 65,
    }.get(
        str(customer.risk_rating).lower(),
        35,
    )

    if new_beneficiary:
        score += 25

    if amount >= Decimal("100000"):
        score += 15
    elif amount >= Decimal("50000"):
        score += 8

    if rail == "RTGS":
        score += 10

    return min(score, 100)


class CustomerPayment(CustomerView):

    def post(self, request):

        account_code = str(
            request.data.get("account_code", "")
        ).strip()

        recipient_code = str(
            request.data.get("recipient_account_code", "")
        ).strip()

        rail = str(
            request.data.get("rail", "")
        ).strip().upper()

        beneficiary = str(
            request.data.get("beneficiary", "")
        ).strip()

        idempotency_key = str(
            request.data.get("idempotency_key", "")
        ).strip()

        new_beneficiary = (
            request.data.get("new_beneficiary", False) is True
        )

        if not account_code:
            raise Fail("Select an account.")

        if rail not in ONLINE_RAILS:
            raise Fail("Select a supported payment method.")

        if not beneficiary:
            raise Fail("Enter the beneficiary name.")

        if len(beneficiary) > 80:
            raise Fail("Beneficiary details are too long.")

        if not idempotency_key or len(idempotency_key) > 64:
            raise Fail("Invalid payment reference.")

        try:
            amount = Decimal(
                str(request.data.get("amount_inr", ""))
            )
        except (InvalidOperation, TypeError, ValueError):
            raise Fail("Enter a valid payment amount.")

        if not amount.is_finite() or amount <= 0:
            raise Fail("Payment amount must be greater than zero.")

        if amount.as_tuple().exponent < -2:
            raise Fail(
                "Payment amount cannot have more than two decimal places."
            )

        # Sender must belong to the logged-in customer.
        account = Account.objects.filter(
            code=account_code,
            customer=self.customer,
            kind="CUSTOMER",
        ).first()

        if account is None:
            raise Fail("The selected account was not found.")

        if account.bank_frozen:
            raise Fail("This account is frozen. Payments are unavailable.")

        if str(account.status).lower() != "active":
            raise Fail("This account is not active.")

        # Optional direct transfer to another Vestro customer.
        destination_account = None

        if recipient_code:
            destination_account = (
                Account.objects
                .select_related("customer")
                .filter(
                    code=recipient_code,
                    kind="CUSTOMER",
                )
                .first()
            )

            if destination_account is None:
                raise Fail("Recipient account was not found.")

            if destination_account.customer_id is None:
                raise Fail("Recipient account has no customer owner.")

            if destination_account.pk == account.pk:
                raise Fail("You cannot transfer to the same account.")

        policy = RailPolicy.objects.filter(
            rail=rail
        ).first()

        if policy is None:
            raise Fail("Payment method is not configured.")

        if not policy.enabled:
            raise Fail("This payment method is temporarily unavailable.")

        if amount > Decimal(str(policy.max_per_txn)):
            raise Fail(
                f"Payment exceeds the {rail} per-transaction limit."
            )

        frm_score = customer_fraud_score(
            self.customer,
            amount,
            rail,
            new_beneficiary,
        )

        tx = initiate_payment(
            account=account,
            rail=rail,
            amount_inr=amount,
            beneficiary=beneficiary,
            new_beneficiary=new_beneficiary,
            frm_score=frm_score,
            idempotency_key=idempotency_key,
            destination_account=destination_account,
        )

        messages = {
            "SUCCESS": "Payment completed successfully.",
            "HELD": "Payment submitted and held for staff approval.",
            "FAILED": "Payment could not be completed.",
        }

        return Response({
            "ok": tx.status in {"SUCCESS", "HELD"},
            "ref": tx.ref,
            "status": tx.status,
            "rail": tx.rail,
            "amount_paise": tx.amount_paise,
            "beneficiary": tx.beneficiary,
            "recipient_account": (
                tx.to_account.code
                if destination_account and tx.to_account
                else None
            ),
            "frm_score": tx.frm_score,
            "message": messages.get(
                tx.status,
                "Payment received.",
            ),
        })


# ============================================================
# INSTITUTION STAFF DASHBOARD
# ============================================================

class Institution(StaffView):

    def get(self, request):

        accts = Account.objects.filter(
            kind="CUSTOMER"
        )

        agg = accts.aggregate(
            balance=Coalesce(Sum("balance_paise"), 0),
            n=Count("id"),
            dormant=Count(
                "id",
                filter=Q(status="dormant"),
            ),
        )

        def dist(field, order):
            got = {
                r[field]: r["n"]
                for r in Customer.objects
                .values(field)
                .annotate(n=Count("id"))
                .order_by()
            }

            return (
                {k: got[k] for k in order if k in got}
                |
                {k: v for k, v in got.items() if k not in order}
            )

        dep = Deposit.objects.aggregate(
            s=Coalesce(Sum("principal_paise"), 0),
            n=Count("id"),
        )

        loans = Loan.objects.aggregate(
            s=Coalesce(Sum("amount_paise"), 0),
            n=Count("id"),
        )

        by_type = {
            r["loan_type"]: r["s"] // 100
            for r in Loan.objects
            .values("loan_type")
            .annotate(s=Sum("amount_paise"))
            .order_by()
        }

        cards = Card.objects.aggregate(
            n=Count("id"),
            blocked=Count(
                "id",
                filter=Q(blocked=True),
            ),
            online=Count(
                "id",
                filter=Q(online=True),
            ),
            intl=Count(
                "id",
                filter=Q(international=True),
            ),
        )

        since = timezone.now() - timedelta(
            days=WINDOW_DAYS
        )

        rows = (
            Transaction.objects
            .filter(
                created_at__gte=since,
                rail__in=RAILS,
            )
            .values("rail")
            .annotate(
                count=Count("id"),
                amount=Sum("amount_paise"),
                failed=Count(
                    "id",
                    filter=Q(status="FAILED"),
                ),
                high=Count(
                    "id",
                    filter=Q(frm_score__gte=RISK_HOLD_SCORE),
                ),
            )
            .order_by()
        )

        by_rail = {
            r["rail"]: r
            for r in rows
        }

        rails = []

        for rail in RAILS:

            r = by_rail.get(
                rail,
                {
                    "count": 0,
                    "amount": 0,
                    "failed": 0,
                    "high": 0,
                },
            )

            rails.append({
                "rail": rail,
                "count": r["count"],
                "amount": (r["amount"] or 0) // 100,
                "failure_pct": (
                    round(
                        100 * r["failed"] / r["count"],
                        1,
                    )
                    if r["count"] else 0
                ),
                "high_risk": r["high"],
            })

        branches = (
            Branch.objects.annotate(
                n_customers=Count(
                    "customers",
                    distinct=True,
                ),
                n_accounts=Count(
                    "customers__accounts",
                    distinct=True,
                ),
                n_dormant=Count(
                    "customers__accounts",
                    filter=Q(
                        customers__accounts__status="dormant"
                    ),
                    distinct=True,
                ),
                bal=Coalesce(
                    Sum("customers__accounts__balance_paise"),
                    Value(0),
                ),
            )
            .order_by("-bal")[:15]
        )

        return Response({

            "kpis": {
                "customers": Customer.objects.count(),
                "accounts": agg["n"],
                "dormant_accounts": agg["dormant"],
                "balance": agg["balance"] // 100,
                "deposit_book": dep["s"] // 100,
                "deposits": dep["n"],
                "loan_book": loans["s"] // 100,
                "loans": loans["n"],
                "cards": cards["n"],
                "cards_blocked": cards["blocked"],
                "branches": Branch.objects.count(),
            },

            "states": Branch.objects.values(
                "state"
            ).distinct().count(),

            "segments": dist(
                "segment",
                ["Retail", "Premier", "Private", "SME"],
            ),

            "kyc": dist(
                "kyc_level",
                ["full", "min", "pending"],
            ),

            "risk": dist(
                "risk_rating",
                ["low", "medium", "high"],
            ),

            "loan_book_by_type": by_type,

            "card_features": {
                "online": cards["online"],
                "international": cards["intl"],
                "total": cards["n"],
            },

            "rails": rails,

            "policy": {
                p.rail: {
                    "enabled": p.enabled,
                    "max_per_txn": p.max_per_txn,
                    "ceiling": p.ceiling,
                }
                for p in RailPolicy.objects.filter(
                    rail__in=POLICY_RAILS
                )
            },

            "branches": [
                {
                    "id": b.code,
                    "name": b.name,
                    "state": b.state,
                    "type": b.kind,
                    "customers": b.n_customers,
                    "accounts": b.n_accounts,
                    "dormant": b.n_dormant,
                    "balance": b.bal // 100,
                }
                for b in branches
            ],

        })


# ============================================================
# APPROVAL QUEUE
# ============================================================

def item_dict(item, staff):

    if item.kind == "payment":

        tx = item.transaction

        data = {
            "customer_id": tx.customer.code,
            "beneficiary": tx.beneficiary,
            "amount_inr": tx.amount_paise // 100,
            "high_value": item.high_value,
            "frm_score": tx.frm_score,
            "new_beneficiary": tx.new_beneficiary,
        }

    else:

        la = item.loan_application
        foir = float(la.foir)

        data = {
            "customer": la.customer.name,
            "loan_type": la.loan_type,
            "amount": la.amount_paise // 100,
            "foir": foir,
            "recommendation": (
                "APPROVE" if foir <= 0.5 else "REVIEW"
            ),
        }

    return {
        "id": item.ref,
        "state": item.state,
        "data": data,
        "actions": item_actions(item, staff),
    }


class Queue(StaffView):

    def get(self, request):

        items = (
            ApprovalItem.objects
            .filter(done=False)
            .select_related(
                "transaction__customer",
                "loan_application__customer",
            )
            .order_by("id")
        )

        events = AuditEvent.objects.order_by("-id")[:40]

        return Response({

            "high_value_threshold": HIGH_VALUE_INR,

            "payments": [
                item_dict(i, self.staff)
                for i in items
                if i.kind == "payment"
            ],

            "loans": [
                item_dict(i, self.staff)
                for i in items
                if i.kind == "loan"
            ],

            "events": [
                {
                    "id": f"EV-{e.id}",
                    "ts": e.ts.isoformat(),
                    "customer_id": e.customer_id,
                    "type": e.type,
                    "severity": e.severity,
                    "detail": e.detail,
                }
                for e in events
            ],

        })


# ============================================================
# CUSTOMER SEARCH
# ============================================================

class Search(StaffView):

    def get(self, request):

        q = request.query_params.get(
            "q",
            "",
        ).strip()

        if len(q) < 2:
            raise Fail(
                "Enter at least 2 characters."
            )

        custs = (
            Customer.objects
            .filter(
                Q(name__icontains=q)
                | Q(code__icontains=q)
            )
            .prefetch_related("accounts")
            .order_by("name")[:20]
        )

        return Response({
            "items": [
                {
                    "id": c.code,
                    "name": c.name,
                    "city": c.city,
                    "segment": c.segment,
                    "kyc_level": c.kyc_level,
                    "risk_rating": c.risk_rating,

                    "accounts": [
                        {
                            "id": a.code,
                            "masked": a.masked,
                            "balance": a.balance_paise // 100,
                            "status": a.status,
                            "bank_frozen": a.bank_frozen,
                        }
                        for a in c.accounts.all()
                    ],
                }
                for c in custs
            ]
        })


# ============================================================
# PAYMENT POLICY
# ============================================================

class PolicyView(StaffView):

    def post(self, request):

        if self.staff.role != "regionhead":
            raise PermissionDenied(
                "Only a regional head can change payment policy."
            )

        pol = RailPolicy.objects.filter(
            rail=request.data.get("mode")
        ).first()

        if not pol:
            raise Fail(
                "Unknown payment rail."
            )

        changes = {}

        if "enabled" in request.data:

            pol.enabled = bool(
                request.data["enabled"]
            )

            changes["enabled"] = pol.enabled

        if "max_per_txn" in request.data:

            try:
                n = int(
                    request.data["max_per_txn"]
                )

            except (TypeError, ValueError):
                raise Fail(
                    "Enter a valid limit."
                )

            if n <= 0:
                raise Fail(
                    "Enter a valid limit."
                )

            if n > pol.ceiling:
                raise Fail(
                    f"Limit cannot exceed the ceiling of ₹{pol.ceiling:,}."
                )

            pol.max_per_txn = n
            changes["max_per_txn"] = n

        pol.save()

        audit(
            "policy_changed",
            "warn" if changes.get("enabled") is False else "info",
            {
                "rail": pol.rail,
                **changes,
            },
            "-",
            self.staff.display_name,
        )

        return Response({
            "ok": True,
        })


# ============================================================
# ACCOUNT FREEZE
# ============================================================

class Freeze(StaffView):

    def post(self, request, code):

        a = (
            Account.objects
            .select_related("customer")
            .filter(
                code=code,
                kind="CUSTOMER",
            )
            .first()
        )

        if not a:
            raise Fail(
                "Account not found."
            )

        if request.data.get("frozen"):

            reason = str(
                request.data.get("reason", "")
            ).strip()

            if not reason:
                raise Fail(
                    "A reason is required to freeze an account."
                )

            a.bank_frozen = True
            a.freeze_reason = reason

            audit(
                "account_frozen",
                "warn",
                {
                    "account": a.masked,
                    "reason": reason,
                },
                a.customer.code,
                self.staff.display_name,
            )

        else:

            if self.staff.role != "regionhead":
                raise PermissionDenied(
                    "Only a regional head can lift a freeze."
                )

            a.bank_frozen = False
            a.freeze_reason = ""

            audit(
                "freeze_lifted",
                "info",
                {
                    "account": a.masked,
                },
                a.customer.code,
                self.staff.display_name,
            )

        a.save(
            update_fields=[
                "bank_frozen",
                "freeze_reason",
            ]
        )

        return Response({
            "ok": True,
        })


# ============================================================
# MAKER-CHECKER ACTIONS
# ============================================================

class Action(StaffView):

    def post(self, request, ref, action):

        if action not in {
            "authorise",
            "release",
            "approve",
            "reject",
        }:
            raise Fail(
                "Unknown action."
            )

        apply_action(
            ref,
            self.staff,
            action,
            str(request.data.get("note", "")),
        )

        return Response({
            "ok": True,
        })
