"""Role-based access control. Roles are Django groups; each maps to a fixed permission set."""
from rest_framework.permissions import BasePermission

ROLE_PERMS = {
    "viewer":    {"read:summary"},
    "auditor":   {"read:summary", "read:findings", "read:reports", "read:metrics", "read:groundtruth"},
    # assessors never see ground truth (prevents tuning Rebel to the answer key)
    "assessor":  {"read:summary", "read:findings", "read:reports", "run:assessment", "write:evidence"},
    "connector": {"read:source", "write:evidence"},          # machine identity used by Rebel to pull data / push evidence
    "admin":     {"*"},
}

def perms_for(user):
    if not user or not user.is_authenticated: return set()
    if user.is_superuser: return {"*"}
    out = set()
    for g in user.groups.values_list("name", flat=True): out |= ROLE_PERMS.get(g, set())
    return out

def has_perm(user, perm):
    p = perms_for(user); return "*" in p or perm in p

class Needs(BasePermission):
    def __init__(self, perm): self.perm = perm
    def has_permission(self, request, view): return has_perm(request.user, self.perm)

def needs(perm):
    class P(Needs):
        def __init__(self): super().__init__(perm)
    P.__name__ = f"Needs_{perm.replace(':', '_')}"; return P

def ensure_roles():
    from django.contrib.auth.models import Group
    for r in ROLE_PERMS: Group.objects.get_or_create(name=r)
