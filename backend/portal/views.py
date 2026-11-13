from datetime import timedelta

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

from .models import (CustomerAccess, Account, ApprovalItem, AuditEvent, Branch, Card, Customer, Deposit, Loan, RailPolicy,
                     StaffProfile, Transaction, HIGH_VALUE_INR, POLICY_RAILS, RAILS, RISK_HOLD_SCORE)
from .services import Fail, apply_action, audit, item_actions

WINDOW_DAYS = 30


def user_dict(s):
    return {"username": s.user.username, "name": s.display_name, "role": s.role}


class StaffView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        staff = getattr(request.user, "portal_staff", None)
        if staff is None:
            raise PermissionDenied("Staff access only.")
        self.staff = staff


# ---------- public ----------
class Demo(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if not getattr(settings, "PORTAL_DEMO_MODE", settings.DEBUG):
            return Response({"staff": []})
        return Response({"staff": [user_dict(s) for s in StaffProfile.objects.select_related("user").order_by("role", "display_name")]})


class Login(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(username=request.data.get("username", ""), password=request.data.get("password", ""))
        staff = getattr(user, "portal_staff", None) if user else None
        if not user or not user.is_active:
            raise AuthenticationFailed("Invalid user ID or password.")
        if staff is None:
            raise PermissionDenied("This is the staff console. Customers use the customer portal.")
        token = AccessToken.for_user(user)
        token.set_exp(lifetime=timedelta(hours=8))
        audit("staff_login", "info", {}, "-", staff.display_name)
        return Response({"token": str(token), "user": user_dict(staff)})


# ---------- staff ----------
class Me(StaffView):
    def get(self, request):
        return Response({"user": user_dict(self.staff)})


# ---------- customer portal ----------
class CustomerLogin(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")

        user = authenticate(username=username, password=password)

        if not user or not user.is_active:
            raise AuthenticationFailed("Invalid user ID or password.")

        access = getattr(user, "portal_customer", None)
        if access is None:
            raise PermissionDenied("This account does not have customer portal access.")

        if getattr(user, "portal_staff", None) is not None:
            raise PermissionDenied("Use the institution staff portal for this account.")

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

        access = getattr(request.user, "portal_customer", None)
        if access is None:
            raise PermissionDenied("Customer portal access only.")

        if getattr(request.user, "portal_staff", None) is not None:
            raise PermissionDenied("Staff accounts cannot use customer endpoints.")

        self.customer = access.customer


class CustomerDashboard(CustomerView):
    def get(self, request):
        accounts = Account.objects.filter(
            customer=self.customer,
            kind="CUSTOMER",
        ).order_by("code")

        transactions = (
            Transaction.objects.filter(customer=self.customer)
            .select_related("from_account", "to_account")
            .order_by("-created_at")[:50]
        )

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
            "transactions": [
                {
                    "ref": tx.ref,
                    "rail": tx.rail,
                    "amount_paise": tx.amount_paise,
                    "status": tx.status,
                    "beneficiary": tx.beneficiary,
                    "failure_reason": tx.failure_reason,
                    "from_account": tx.from_account.masked if tx.from_account else None,
                    "to_account": tx.to_account.masked if tx.to_account else None,
                    "created_at": tx.created_at.isoformat(),
                }
                for tx in transactions
            ],
        })


class Institution(StaffView):
    def get(self, request):
        accts = Account.objects.filter(kind="CUSTOMER")
        agg = accts.aggregate(balance=Coalesce(Sum("balance_paise"), 0), n=Count("id"), dormant=Count("id", filter=Q(status="dormant")))

        def dist(field, order):
            got = {r[field]: r["n"] for r in Customer.objects.values(field).annotate(n=Count("id")).order_by()}
            return {k: got[k] for k in order if k in got} | {k: v for k, v in got.items() if k not in order}

        dep = Deposit.objects.aggregate(s=Coalesce(Sum("principal_paise"), 0), n=Count("id"))
        loans = Loan.objects.aggregate(s=Coalesce(Sum("amount_paise"), 0), n=Count("id"))
        by_type = {r["loan_type"]: r["s"] // 100 for r in Loan.objects.values("loan_type").annotate(s=Sum("amount_paise")).order_by()}
        cards = Card.objects.aggregate(n=Count("id"), blocked=Count("id", filter=Q(blocked=True)),
                                       online=Count("id", filter=Q(online=True)), intl=Count("id", filter=Q(international=True)))

        since = timezone.now() - timedelta(days=WINDOW_DAYS)
        rows = (Transaction.objects.filter(created_at__gte=since, rail__in=RAILS).values("rail")
                .annotate(count=Count("id"), amount=Sum("amount_paise"), failed=Count("id", filter=Q(status="FAILED")),
                          high=Count("id", filter=Q(frm_score__gte=RISK_HOLD_SCORE))).order_by())
        by_rail = {r["rail"]: r for r in rows}
        rails = []
        for rail in RAILS:
            r = by_rail.get(rail, {"count": 0, "amount": 0, "failed": 0, "high": 0})
            rails.append({"rail": rail, "count": r["count"], "amount": (r["amount"] or 0) // 100,
                          "failure_pct": round(100 * r["failed"] / r["count"], 1) if r["count"] else 0, "high_risk": r["high"]})

        branches = (Branch.objects.annotate(
            n_customers=Count("customers", distinct=True),
            n_accounts=Count("customers__accounts", distinct=True),
            n_dormant=Count("customers__accounts", filter=Q(customers__accounts__status="dormant"), distinct=True),
            bal=Coalesce(Sum("customers__accounts__balance_paise"), Value(0))).order_by("-bal")[:15])

        return Response({
            "kpis": {"customers": Customer.objects.count(), "accounts": agg["n"], "dormant_accounts": agg["dormant"],
                     "balance": agg["balance"] // 100, "deposit_book": dep["s"] // 100, "deposits": dep["n"],
                     "loan_book": loans["s"] // 100, "loans": loans["n"], "cards": cards["n"], "cards_blocked": cards["blocked"],
                     "branches": Branch.objects.count()},
            "states": Branch.objects.values("state").distinct().count(),
            "segments": dist("segment", ["Retail", "Premier", "Private", "SME"]),
            "kyc": dist("kyc_level", ["full", "min", "pending"]),
            "risk": dist("risk_rating", ["low", "medium", "high"]),
            "loan_book_by_type": by_type,
            "card_features": {"online": cards["online"], "international": cards["intl"], "total": cards["n"]},
            "rails": rails,
            "policy": {p.rail: {"enabled": p.enabled, "max_per_txn": p.max_per_txn, "ceiling": p.ceiling}
                       for p in RailPolicy.objects.filter(rail__in=POLICY_RAILS)},
            "branches": [{"id": b.code, "name": b.name, "state": b.state, "type": b.kind, "customers": b.n_customers,
                          "accounts": b.n_accounts, "dormant": b.n_dormant, "balance": b.bal // 100} for b in branches],
        })


def item_dict(item, staff):
    if item.kind == "payment":
        tx = item.transaction
        data = {"customer_id": tx.customer.code, "beneficiary": tx.beneficiary, "amount_inr": tx.amount_paise // 100,
                "high_value": item.high_value, "frm_score": tx.frm_score, "new_beneficiary": tx.new_beneficiary}
    else:
        la = item.loan_application
        foir = float(la.foir)
        data = {"customer": la.customer.name, "loan_type": la.loan_type, "amount": la.amount_paise // 100, "foir": foir,
                "recommendation": "APPROVE" if foir <= 0.5 else "REVIEW"}
    return {"id": item.ref, "state": item.state, "data": data, "actions": item_actions(item, staff)}


class Queue(StaffView):
    def get(self, request):
        items = (ApprovalItem.objects.filter(done=False)
                 .select_related("transaction__customer", "loan_application__customer").order_by("id"))
        events = AuditEvent.objects.order_by("-id")[:40]
        return Response({
            "high_value_threshold": HIGH_VALUE_INR,
            "payments": [item_dict(i, self.staff) for i in items if i.kind == "payment"],
            "loans": [item_dict(i, self.staff) for i in items if i.kind == "loan"],
            "events": [{"id": f"EV-{e.id}", "ts": e.ts.isoformat(), "customer_id": e.customer_id, "type": e.type,
                        "severity": e.severity, "detail": e.detail} for e in events],
        })


class Search(StaffView):
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            raise Fail("Enter at least 2 characters.")
        custs = (Customer.objects.filter(Q(name__icontains=q) | Q(code__icontains=q))
                 .prefetch_related("accounts").order_by("name")[:20])
        return Response({"items": [{
            "id": c.code, "name": c.name, "city": c.city, "segment": c.segment, "kyc_level": c.kyc_level, "risk_rating": c.risk_rating,
            "accounts": [{"id": a.code, "masked": a.masked, "balance": a.balance_paise // 100, "status": a.status, "bank_frozen": a.bank_frozen}
                         for a in c.accounts.all()]} for c in custs]})


class PolicyView(StaffView):
    def post(self, request):
        if self.staff.role != "regionhead":
            raise PermissionDenied("Only a regional head can change payment policy.")
        pol = RailPolicy.objects.filter(rail=request.data.get("mode")).first()
        if not pol:
            raise Fail("Unknown payment rail.")
        changes = {}
        if "enabled" in request.data:
            pol.enabled = bool(request.data["enabled"])
            changes["enabled"] = pol.enabled
        if "max_per_txn" in request.data:
            try:
                n = int(request.data["max_per_txn"])
            except (TypeError, ValueError):
                raise Fail("Enter a valid limit.")
            if n <= 0:
                raise Fail("Enter a valid limit.")
            if n > pol.ceiling:
                raise Fail(f"Limit cannot exceed the ceiling of ₹{pol.ceiling:,}.")
            pol.max_per_txn = n
            changes["max_per_txn"] = n
        pol.save()
        audit("policy_changed", "warn" if changes.get("enabled") is False else "info", {"rail": pol.rail, **changes}, "-", self.staff.display_name)
        return Response({"ok": True})


class Freeze(StaffView):
    def post(self, request, code):
        a = Account.objects.select_related("customer").filter(code=code, kind="CUSTOMER").first()
        if not a:
            raise Fail("Account not found.")
        if request.data.get("frozen"):
            reason = str(request.data.get("reason", "")).strip()
            if not reason:
                raise Fail("A reason is required to freeze an account.")
            a.bank_frozen, a.freeze_reason = True, reason
            audit("account_frozen", "warn", {"account": a.masked, "reason": reason}, a.customer.code, self.staff.display_name)
        else:
            if self.staff.role != "regionhead":
                raise PermissionDenied("Only a regional head can lift a freeze.")
            a.bank_frozen, a.freeze_reason = False, ""
            audit("freeze_lifted", "info", {"account": a.masked}, a.customer.code, self.staff.display_name)
        a.save(update_fields=["bank_frozen", "freeze_reason"])
        return Response({"ok": True})


class Action(StaffView):
    def post(self, request, ref, action):
        if action not in {"authorise", "release", "approve", "reject"}:
            raise Fail("Unknown action.")
        apply_action(ref, self.staff, action, str(request.data.get("note", "")))
        return Response({"ok": True})