"""Step 1b: controlled defect injection + near-miss decoys. Every defect is recorded as ground truth."""
from .common import *
from .catalog import *


def G(cat, ref, desc, asset_id=None, sev=None):
    m = SCEN[cat]
    return {"category": cat, "entity_ref": ref, "module": m["module"], "severity": sev or m["severity"], "controls": list(m["controls"]),
            "asset_id": asset_id, "description": desc}

def DC(cat, ref, note): return {"category": cat, "entity_ref": ref, "note": note}


class Ctx:
    def __init__(s, ds, rng): s.ds, s.rng, s.used = ds, rng, set()
    def take(s, pool, n, tag, kf=lambda x: x["id"]):
        pool = [p for p in pool if (tag, kf(p)) not in s.used]
        pick = s.rng.sample(pool, min(n, len(pool)))
        for p in pick: s.used.add((tag, kf(p)))
        return pick
    def assets(s, pred, n, tag, fix=None):
        pick = s.take([a for a in s.ds["assets"] if pred(a)], n, tag)
        if len(pick) < n and fix:
            ids = {a["id"] for a in pick}
            extra = s.take([a for a in s.ds["assets"] if a["id"] not in ids], n - len(pick), tag)
            for a in extra: fix(a)
            pick += extra
        return pick

def _priv(e): return any(x["role"] in PRIV_ROLES for x in e["entitlements"])
def _bump(a): a["criticality"] = max(a["criticality"], 4)


def inject(ds, rng, scale):
    c, gt, dec = Ctx(ds, rng), [], []
    n = lambda cat: max(1, round(SCEN[cat]["count"] * min(scale, 2)))
    hum = lambda e: e["type"] == "human" and e["status"] == "active"
    # ---- identities
    tg = [a for a in ds["assets"] if a["criticality"] == 5 and a["type"] in ("database", "server")]
    for e in c.take([e for e in ds["employees"] if hum(e) and e["dept"] not in PRIV_DEPTS], n("PRIV_EXCESSIVE_ADMIN"), "emp"):
        a, role = rng.choice(tg), rng.choice(["dba", "admin"])
        e["entitlements"].append({"asset_id": a["id"], "role": role, "granted": d(rng.randint(5, 200)), "ticket": None})
        gt.append(G("PRIV_EXCESSIVE_ADMIN", f"emp:{e['id']}:asset:{a['id']}", f"{e['dept']} employee holds '{role}' on critical asset {a['name']} with no approved ticket", a["id"]))
    for i in range(1, n("PRIV_SHARED_ACCOUNT") + 1):
        a = rng.choice(tg)
        ds["employees"].append({"id": f"SHR-{i:02d}", "name": f"shared-admin-{i:02d}", "email": None, "dept": "IT-Infra", "title": "shared account", "type": "shared",
                                "status": "active", "account_enabled": True, "mfa_enabled": False, "pam_managed": False, "last_access_review": d(100),
                                "entitlements": [{"asset_id": a["id"], "role": "admin", "granted": d(900), "ticket": None}]})
        gt.append(G("PRIV_SHARED_ACCOUNT", f"emp:SHR-{i:02d}", "Shared account holds admin role", a["id"]))
    for e in c.take([e for e in ds["employees"] if e["status"] == "terminated"], n("PRIV_TERMINATED_ACTIVE"), "emp"):
        a = rng.choice(ds["assets"]); e["account_enabled"] = True
        e["entitlements"] = [{"asset_id": a["id"], "role": "operator", "granted": d(400), "ticket": "REQ-0001"}]
        gt.append(G("PRIV_TERMINATED_ACTIVE", f"emp:{e['id']}", f"Terminated {e['termination_date']} but account enabled"))
    pp = [e for e in ds["employees"] if hum(e) and e["dept"] in PRIV_DEPTS and _priv(e)]
    for e in c.take(pp, n("PRIV_NO_MFA_ADMIN"), "emp"):
        e["mfa_enabled"] = False; gt.append(G("PRIV_NO_MFA_ADMIN", f"emp:{e['id']}", "Privileged user without MFA"))
    for e in c.take(pp, n("PRIV_STALE_REVIEW"), "emp"):
        e["last_access_review"] = d(rng.randint(200, 420)); gt.append(G("PRIV_STALE_REVIEW", f"emp:{e['id']}", f"Last access review {e['last_access_review']}"))
    # ---- software / configuration
    for a in c.assets(lambda a: a["software"] and a["criticality"] >= 3, n("VULN_SOFTWARE"), "vuln"):
        sw = rng.choice(a["software"]); info = SOFT[sw["name"]]; sw["version"] = older(info["fixed"])
        gt.append(G("VULN_SOFTWARE", f"asset:{a['id']}:{sw['name']}", f"{sw['name']} {sw['version']} < fixed {info['fixed']} ({info['vuln_id']})", a["id"], sev_from_cvss(info["cvss"])))
    def cfg(cat, pred, mut, desc, fix=None):
        for a in c.assets(pred, n(cat), "cfg", fix): mut(a["config"]); gt.append(G(cat, f"asset:{a['id']}", desc, a["id"]))
    cfg("MISCONFIG_PUBLIC_STORAGE", lambda a: a["type"] == "storage_bucket" and a["criticality"] >= 3, lambda k: k.update(public_access=True, classification="confidential"), "Confidential bucket publicly accessible")
    cfg("MISCONFIG_NO_ENCRYPTION", lambda a: a["type"] in ("database", "storage_bucket", "server") and a["criticality"] >= 3, lambda k: k.update(encrypted_at_rest=False), "Encryption at rest disabled")
    cfg("MISCONFIG_DEFAULT_CREDS", lambda a: a["type"] in ("server", "network", "firewall", "application"), lambda k: k.update(default_credentials=True), "Vendor default credentials active")
    cfg("MISCONFIG_LOGGING_OFF", lambda a: a["criticality"] >= 4 and a["type"] not in ("endpoint", "vendor_service"), lambda k: k.update(logging_enabled=False), "Logging disabled on critical asset")
    # ---- crypto
    def mut(x):
        k = x["kind"]
        if k == "key": x.update(algorithm="3DES", key_bits=168)
        elif k == "hash": x.update(algorithm="SHA-1", key_bits=160)
        elif k == "protocol": x.update(protocol_version=rng.choice(["TLS1.0", "TLS1.1"]))
        else: x.update(algorithm="RSA", key_bits=1024, hybrid=False)
    zn = {a["id"]: a["zone"] for a in ds["assets"]}
    pay = [x for x in ds["crypto"] if x["kind"] == "protocol" and zn.get(x["asset_id"]) in ("atm-switch", "payments")]
    w1 = c.take(pay, min(4, n("CRYPTO_WEAK_ALGO") // 2), "cry")   # legacy TLS on ATM / payment switches first
    weak = w1 + c.take(ds["crypto"], n("CRYPTO_WEAK_ALGO") - len(w1), "cry")
    for x in weak:
        mut(x); gt.append(G("CRYPTO_WEAK_ALGO", f"crypto:{x['id']}", f"{x['kind']} uses {x['algorithm']} {x.get('protocol_version') or ''}".strip(), x["asset_id"]))
    for x in c.take([x for x in ds["crypto"] if x["kind"] == "certificate"], n("CRYPTO_CERT_EXPIRED"), "cry"):
        x["expiry"] = d(rng.randint(5, 90)); gt.append(G("CRYPTO_CERT_EXPIRED", f"crypto:{x['id']}", f"Certificate expired {x['expiry']}", x["asset_id"]))
    for x in c.take([x for x in ds["crypto"] if x["kind"] == "certificate" and qvulnerable(x) and x["asset_criticality"] >= 4], n("CRYPTO_PQC_NO_PLAN"), "cry"):
        x.update(data_lifetime_years=rng.choice([10, 12, 15, 20, 25]), pqc_plan=False, crypto_agile=False)
        gt.append(G("CRYPTO_PQC_NO_PLAN", f"crypto:{x['id']}", f"{x['algorithm']} protects {x['data_lifetime_years']}y data; no PQC plan", x["asset_id"]))
    # ---- governance
    for p in c.take(ds["policies"], n("POLICY_OUTDATED"), "pol"):
        p["last_review"] = d(rng.randint(380, 900)); gt.append(G("POLICY_OUTDATED", f"policy:{p['id']}", f"{p['title']} last reviewed {p['last_review']}"))
    for name in rng.sample(REQUIRED_PLAYBOOKS, min(n("IR_PLAYBOOK_MISSING"), 3)):
        ds["ir_plan"]["playbooks"].remove(name); gt.append(G("IR_PLAYBOOK_MISSING", f"ir:playbook:{name}", f"No '{name}' playbook"))
    ds["ir_plan"]["last_drill_date"] = d(rng.randint(420, 600)); gt.append(G("IR_DRILL_STALE", "ir:drill", "Last exercise >12 months ago"))
    evs = [e for e in ds["events"] if e["severity"] <= 2]
    for e in c.take(evs, n("IR_SLOW_CONTAINMENT"), "evt"):
        e["contained_hours"] = round(rng.uniform(5, 30), 1); gt.append(G("IR_SLOW_CONTAINMENT", f"event:{e['id']}", f"Contained in {e['contained_hours']}h (target 4h)", e["asset_id"], "high" if e["severity"] == 2 else "critical"))
    # ---- resilience
    bk = ds["backups"]
    for b in c.take(bk, n("BACKUP_RESTORE_UNTESTED"), "bk", lambda b: b["asset_id"]):
        b["last_restore_test"] = d(rng.randint(400, 700)); gt.append(G("BACKUP_RESTORE_UNTESTED", f"backup:{b['asset_id']}", f"Last restore test {b['last_restore_test']}", b["asset_id"]))
    for b in c.take(bk, n("BACKUP_NOT_IMMUTABLE"), "bk2", lambda b: b["asset_id"]):
        b["immutable"] = False; gt.append(G("BACKUP_NOT_IMMUTABLE", f"backup:{b['asset_id']}", "No immutable copy", b["asset_id"]))
    for b in c.take([b for b in bk if b["criticality"] == 5], n("DR_NO_REPLICA"), "bk3", lambda b: b["asset_id"]):
        b["dr_replica"] = False; gt.append(G("DR_NO_REPLICA", f"dr:{b['asset_id']}", "Criticality-5 asset without DR replica", b["asset_id"]))
    # ---- third parties / inventory
    imp = [v for v in ds["vendors"] if v["criticality"] in ("critical", "important")]
    for v in c.take(imp, n("VENDOR_NO_AUDIT_CLAUSE"), "vnd"):
        v["has_audit_clause"] = False; gt.append(G("VENDOR_NO_AUDIT_CLAUSE", f"vendor:{v['id']}", f"{v['criticality']} vendor without audit clause"))
    for v in c.take(imp, n("VENDOR_ASSESSMENT_STALE"), "vnd"):
        v["last_assessment"] = d(rng.randint(400, 700)); gt.append(G("VENDOR_ASSESSMENT_STALE", f"vendor:{v['id']}", f"Assessed {v['last_assessment']}"))
    for i in range(1, n("ASSET_UNMANAGED") + 1):
        hid = f"HOST-U{i:04d}"; ds["discovered_hosts"].append({"host_id": hid, "hostname": f"unk-host-{i:03d}", "asset_id": None, "exempt": False})
        gt.append(G("ASSET_UNMANAGED", f"host:{hid}", "Host seen on network, not in inventory"))
    # ---- Indian-bank scenarios
    dorm = [e for e in ds["employees"] if hum(e) and e.get("last_login")]
    for e in c.take(dorm, n("PRIV_DORMANT_ACCOUNT"), "emp"):
        e["last_login"] = d(rng.randint(100, 400)); gt.append(G("PRIV_DORMANT_ACCOUNT", f"emp:{e['id']}", f"Enabled account, last login {e['last_login']}"))
    cbs = [a for a in ds["assets"] if a["type"] in ("application", "server") and a["zone"] in ("core-banking", "payments") and not a.get("branch_id")]
    sod = [e for e in ds["employees"] if hum(e) and e["dept"] in ("Retail Banking", "Operations", "Payments Ops")]
    for e in c.take(sod, n("PRIV_MAKER_CHECKER_SOD"), "emp"):
        a = rng.choice(cbs)
        e["entitlements"] = [x for x in e["entitlements"] if x["asset_id"] != a["id"]] + [
            {"asset_id": a["id"], "role": r, "granted": d(rng.randint(10, 300)), "ticket": None} for r in ("maker", "checker")]
        gt.append(G("PRIV_MAKER_CHECKER_SOD", f"emp:{e['id']}:asset:{a['id']}", f"{e['dept']} user holds maker and checker on {a['name']}", a["id"]))
    eol_pool = [a for a in ds["assets"] if a["software"] and (a.get("branch_id") or a["criticality"] <= 3)]
    for a in c.take(eol_pool, n("ASSET_EOL_SOFTWARE"), "eol"):
        sw = rng.choice(a["software"]); sw["eol_date"] = d(rng.randint(30, 900))
        gt.append(G("ASSET_EOL_SOFTWARE", f"asset:{a['id']}:{sw['name']}", f"{sw['name']} {sw['version']} past end of support ({sw['eol_date']}) on {a['name']}", a["id"]))
    ds["ir_plan"]["last_dr_drill"] = d(rng.randint(400, 600)); gt.append(G("DR_DRILL_STALE", "ir:dr_drill", "Last DC-to-DR failover drill >12 months ago"))
    rem = [v for v in ds["vendors"] if v["remote_access"]["enabled"] and v["remote_access"]["privileged"]]
    for v in c.take(rem, n("VENDOR_PRIVILEGED_REMOTE"), "vnd2"):
        v["remote_access"]["via_pam"] = False; gt.append(G("VENDOR_PRIVILEGED_REMOTE", f"vendor:{v['id']}", f"{v['service']} vendor has privileged remote access outside PAM"))
    off = [v for v in ds["vendors"] if v["data_access"] == "pii" and v["hosting_country"] == "IN"]
    for v in c.take(off, n("VENDOR_DATA_OFFSHORE"), "vnd3"):
        v["hosting_country"] = rng.choice(["SG", "US", "IE"]); gt.append(G("VENDOR_DATA_OFFSHORE", f"vendor:{v['id']}", f"{v['service']} vendor hosts customer/payment data in {v['hosting_country']}"))
    # ---- decoys (near-miss, compliant)
    for a in c.assets(lambda a: a["software"] and a["criticality"] >= 3, 3, "vuln"):
        sw = rng.choice(a["software"]); sw["version"] = SOFT[sw["name"]]["fixed"]; dec.append(DC("VULN_SOFTWARE", f"asset:{a['id']}:{sw['name']}", "exactly at fixed version"))
    def dcfg(cat, pred, mut, k, note):
        for a in c.assets(pred, k, "cfg"): mut(a["config"]); dec.append(DC(cat, f"asset:{a['id']}", note))
    dcfg("MISCONFIG_PUBLIC_STORAGE", lambda a: a["type"] == "storage_bucket", lambda k: k.update(public_access=True, classification="public"), 2, "public by design (public content)")
    dcfg("MISCONFIG_NO_ENCRYPTION", lambda a: a["criticality"] <= 2, lambda k: k.update(encrypted_at_rest=False), 3, "low-criticality asset")
    dcfg("MISCONFIG_LOGGING_OFF", lambda a: a["criticality"] == 3, lambda k: k.update(logging_enabled=False), 3, "criticality below threshold")
    low = [a for a in ds["assets"] if a["criticality"] <= 2]
    for e in c.take([e for e in ds["employees"] if hum(e) and e["dept"] not in PRIV_DEPTS], 3, "emp"):
        a = rng.choice(low); e["entitlements"].append({"asset_id": a["id"], "role": "admin", "granted": d(50), "ticket": "REQ-7777"})
        dec.append(DC("PRIV_EXCESSIVE_ADMIN", f"emp:{e['id']}:asset:{a['id']}", "local admin on low-criticality endpoint"))
    for e in c.take(pp, 3, "emp"):
        e["last_access_review"] = d(178); dec.append(DC("PRIV_STALE_REVIEW", f"emp:{e['id']}", "reviewed 178 days ago"))
    svc = [e for e in ds["employees"] if e["type"] == "service"][:3]
    for e in svc:
        e["entitlements"][0]["role"] = "admin"; dec.append(DC("PRIV_SHARED_ACCOUNT", f"emp:{e['id']}", "PAM-managed service account"))
    for p in c.take(ds["policies"], 2, "pol"):
        p["last_review"] = d(rng.randint(350, 360)); dec.append(DC("POLICY_OUTDATED", f"policy:{p['id']}", "reviewed within 12 months"))
    std = [v for v in ds["vendors"] if v["criticality"] == "standard"]
    for v in c.take(std, 2, "vnd"):
        v["has_audit_clause"] = False; dec.append(DC("VENDOR_NO_AUDIT_CLAUSE", f"vendor:{v['id']}", "standard-tier vendor"))
    for v in c.take(imp, 2, "vnd"):
        v["last_assessment"] = d(355); dec.append(DC("VENDOR_ASSESSMENT_STALE", f"vendor:{v['id']}", "assessed 355 days ago"))
    for b in c.take(bk, 2, "bk", lambda b: b["asset_id"]):
        b["last_restore_test"] = d(358); dec.append(DC("BACKUP_RESTORE_UNTESTED", f"backup:{b['asset_id']}", "tested 358 days ago"))
    for b in c.take([b for b in bk if b["criticality"] == 4], 2, "bk3", lambda b: b["asset_id"]):
        b["dr_replica"] = False; dec.append(DC("DR_NO_REPLICA", f"dr:{b['asset_id']}", "criticality 4 - replica not mandated"))
    certs = [x for x in ds["crypto"] if x["kind"] == "certificate"]
    for x in c.take(certs, 2, "cry"):
        x["expiry"] = fut(5); dec.append(DC("CRYPTO_CERT_EXPIRED", f"crypto:{x['id']}", "expires in 5 days, not expired"))
    for x in c.take([x for x in certs if qvulnerable(x) and x["asset_criticality"] >= 4], 2, "cry"):
        x.update(data_lifetime_years=9, pqc_plan=False); dec.append(DC("CRYPTO_PQC_NO_PLAN", f"crypto:{x['id']}", "9-year data lifetime, below threshold"))
    for i in (1, 2):
        hid = f"HOST-X{i:04d}"; ds["discovered_hosts"].append({"host_id": hid, "hostname": f"sandbox-{i}", "asset_id": None, "exempt": True, "reason": "approved sandbox"})
        dec.append(DC("ASSET_UNMANAGED", f"host:{hid}", "exempt sandbox"))
    for e in c.take(evs, 3, "evt"):
        e["contained_hours"] = 3.9; dec.append(DC("IR_SLOW_CONTAINMENT", f"event:{e['id']}", "3.9h, within 4h target"))
    for e in c.take(dorm, 3, "emp"):
        e["last_login"] = d(85); dec.append(DC("PRIV_DORMANT_ACCOUNT", f"emp:{e['id']}", "last login 85 days ago"))
    for e in c.take(sod, 3, "emp"):
        a, b = rng.sample(cbs, 2)
        e["entitlements"] += [{"asset_id": a["id"], "role": "maker", "granted": d(60), "ticket": "REQ-7001"}, {"asset_id": b["id"], "role": "checker", "granted": d(60), "ticket": "REQ-7002"}]
        dec.append(DC("PRIV_MAKER_CHECKER_SOD", f"emp:{e['id']}:asset:{a['id']}", "maker and checker on different systems"))
    for a in c.take(eol_pool, 3, "eol"):
        sw = rng.choice(a["software"]); sw["eol_date"] = fut(45)
        dec.append(DC("ASSET_EOL_SOFTWARE", f"asset:{a['id']}:{sw['name']}", "support ends in 45 days, still supported"))
    for v in c.take([v for v in ds["vendors"] if v["remote_access"]["enabled"] and not v["remote_access"]["privileged"]], 2, "vnd2"):
        v["remote_access"]["via_pam"] = False; dec.append(DC("VENDOR_PRIVILEGED_REMOTE", f"vendor:{v['id']}", "non-privileged remote access, PAM not mandated"))
    for v in c.take([v for v in ds["vendors"] if v["hosting_country"] == "IN" and v["data_access"] != "pii"], 2, "vnd3"):
        v["hosting_country"] = "SG"; dec.append(DC("VENDOR_DATA_OFFSHORE", f"vendor:{v['id']}", "offshore hosting but no customer/payment data"))
    return gt, dec


def inject_evidence(ds, rng, scale):
    gt, dec = [], []
    reqs = {r["req_id"]: r for r in ds["evidence_requirements"]}
    pool = [r for r in reqs.values() if r["type"] in ("config_snapshot", "vuln_scan")]
    rng.shuffle(pool)
    k1, k2 = max(1, round(SCEN["EVIDENCE_MISSING"]["count"] * min(scale, 2))), max(1, round(SCEN["EVIDENCE_STALE"]["count"] * min(scale, 2)))
    miss, stale, near = pool[:k1], pool[k1:k1 + k2], pool[k1 + k2:k1 + k2 + 3]
    for r in miss:
        ds["evidence"] = [e for e in ds["evidence"] if not (e["type"] == r["type"] and e["entity_ref"] == r["entity_ref"])]
        gt.append(G("EVIDENCE_MISSING", f"evidence:{r['req_id']}", f"No {r['type']} for {r['entity_ref']}"))
    for r in stale:
        for e in ds["evidence"]:
            if e["type"] == r["type"] and e["entity_ref"] == r["entity_ref"]: e["collected_at"] = d(r["max_age_days"] + rng.randint(15, 120))
        gt.append(G("EVIDENCE_STALE", f"evidence:{r['req_id']}", f"{r['type']} older than {r['max_age_days']}d"))
    for r in near:
        for e in ds["evidence"]:
            if e["type"] == r["type"] and e["entity_ref"] == r["entity_ref"]: e["collected_at"] = d(r["max_age_days"] - 2)
        dec.append(DC("EVIDENCE_STALE", f"evidence:{r['req_id']}", "2 days inside validity window"))
    return gt, dec