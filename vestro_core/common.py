"""Shared helpers and constants. Everything in Vestro is synthetic."""
import datetime as dt, hashlib, json

AS_OF = dt.date(2026, 10, 27)
DISCLAIMER = ("SYNTHETIC DATA. Findings are simulated outputs of a test environment; they are not an actual "
              "regulatory determination, supervisory assessment, audit opinion or legal advice.")
PRIV_ROLES = {"admin", "dba"}
SEV_W = {"critical": 10, "high": 7, "medium": 4, "low": 2}
SEV_ORDER = ["critical", "high", "medium", "low"]

def d(days_ago, as_of=AS_OF): return (as_of - dt.timedelta(days=int(days_ago))).isoformat()
def fut(days, as_of=AS_OF): return (as_of + dt.timedelta(days=int(days))).isoformat()
def to_date(x): return x if isinstance(x, dt.date) else dt.date.fromisoformat(str(x)[:10])
def age_days(iso, as_of=AS_OF): return (to_date(as_of) - to_date(iso)).days
def digest(obj): return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()
def vtuple(v): return tuple(int(x) for x in str(v).split("."))
def older(v):
    p = list(vtuple(v)); p[-1] = max(p[-1] - 1, 0); return ".".join(map(str, p))
def sev_from_cvss(c): return "critical" if c >= 9 else "high" if c >= 7 else "medium" if c >= 4 else "low"
def qvulnerable(c):
    return str(c.get("algorithm", "")).startswith(("RSA", "ECDSA", "ECDH", "DH", "DSA")) and not c.get("hybrid")
def crypto_weak(c):
    a = c.get("algorithm")
    if a in {"3DES", "DES", "RC4", "MD5", "SHA-1"}: return True
    if a == "RSA" and (c.get("key_bits") or 0) < 2048: return True
    return c.get("protocol_version") in {"TLS1.0", "TLS1.1", "SSL3"}
def key(cat, ref): return f"{cat}|{ref}"
