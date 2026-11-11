"""Step 1a: reproducible synthetic baseline (compliant by construction), then scenario injection."""
import random
from .common import *
from .catalog import *
from . import scenarios, evidence as ev

FIRST = ["Aarav", "Vihaan", "Aditya", "Ananya", "Diya", "Isha", "Kabir", "Meera", "Rohan", "Saanvi", "Arjun", "Kavya", "Neha",
         "Rahul", "Priya", "Sanjay", "Tara", "Vikram", "Zoya", "Harpreet", "Gurpreet", "Simran", "Manpreet", "Lakshmi", "Farhan"]
LAST = ["Sharma", "Verma", "Gill", "Singh", "Patel", "Iyer", "Nair", "Reddy", "Khan", "Das", "Mehta", "Joshi", "Kapoor", "Bose",
        "Chopra", "Malhotra", "Sethi", "Rao", "Menon", "Bhatia"]
CERT_ALGS = [("RSA", 3072, False), ("RSA", 2048, False), ("ECDSA-P384", 384, False), ("ECDSA-P384+ML-DSA-65", 384, True)]
EVT_TYPES = ["auth_failure", "malware_alert", "policy_violation", "port_scan", "privilege_change", "config_change", "dlp_alert"]


def generate(seed=42, scale=1.0):
    rng = random.Random(seed)
    ds = _baseline(rng, scale)
    ds["meta"] = {"name": "Vestro Bank (synthetic)", "synthetic": True, "seed": seed, "scale": scale,
                  "as_of": AS_OF.isoformat(), "generator_version": "0.1.0", "disclaimer": DISCLAIMER}
    gt, decoys = scenarios.inject(ds, rng, scale)
    ds["ground_truth"] = gt
    ev.build(ds, rng)
    g2, d2 = scenarios.inject_evidence(ds, rng, scale)
    gt += g2; decoys += d2
    for i, g in enumerate(gt, 1):
        g["gt_id"] = f"GT-{i:04d}"
        g["expected_status"] = ev.expected_status(g, ds["evidence"])
        g["hard"] = g["expected_status"] == "assumed"
    ds["ground_truth"], ds["decoys"] = gt, decoys
    ds["counts"] = {k: len(ds[k]) for k in ("assets", "employees", "vendors", "crypto", "transactions", "events", "evidence", "policies", "backups")}
    return ds


def _baseline(rng, scale):
    n_assets, n_emp = max(200, int(2500 * scale)), max(150, int(1200 * scale))
    n_tx, n_ev = max(2000, int(20000 * scale)), max(600, int(6000 * scale))
    tys, tws = [t for t, _ in TYPE_W], [w for _, w in TYPE_W]
    zs, zws = [z for z, _ in ZONE_W], [w for _, w in ZONE_W]
    assets = []
    for i in range(1, n_assets + 1):
        t, z = rng.choices(tys, tws)[0], rng.choices(zs, zws)[0]
        if t == "endpoint": z = rng.choices(["corporate-it", "core-banking"], [85, 15])[0]
        crit = ZONE_CRIT[z]
        if t == "endpoint": crit = min(crit, 2)
        crit = max(1, min(5, crit + rng.choice([0, 0, 0, -1])))
        loc = "DC-DR" if z == "dr-site" else "CLOUD-REGION-A" if (t == "cloud_instance" or z == "cloud-workloads") else rng.choices(["DC-PRIMARY", "DC-DR"], [80, 20])[0]
        names = SW_BY_TYPE.get(t, [])
        sw = [{"name": n, "version": SOFT[n]["current"]} for n in rng.sample(names, min(len(names), rng.randint(1, 2)))]
        assets.append({"id": f"AST-{i:05d}", "name": f"{z[:3].upper()}-{t[:3].upper()}-{i:05d}", "type": t, "zone": z,
                       "criticality": crit, "environment": "prod", "location": loc, "owner_dept": ZONE_DEPT[z], "vendor_id": None,
                       "internet_facing": z in ("internet-banking", "mobile-banking") and t in ("application", "server", "firewall") and rng.random() < .5,
                       "software": sw, "daily_txn_value_inr": 0.0,
                       "config": {"encrypted_at_rest": True, "default_credentials": False, "public_access": False,
                                  "logging_enabled": True, "classification": "confidential" if crit >= 4 else "internal"}})
    by_zone = {}
    for a in assets: by_zone.setdefault(a["zone"], []).append(a)

    def pick(zones, types, k):
        pool = [a for z in zones for a in by_zone.get(z, []) if types is None or a["type"] in types] or assets
        return rng.sample(pool, min(k, len(pool)))

    # --- identities
    depts, dws = [x for x, _ in DEPT_W], [w for _, w in DEPT_W]
    emps = []
    for i in range(1, n_emp + 1):
        dept = rng.choices(depts, dws)[0]; f, l = rng.choice(FIRST), rng.choice(LAST)
        e = {"id": f"EMP-{i:04d}", "name": f"{f} {l}", "email": f"{f}.{l}{i}@vestro.example".lower(), "dept": dept,
             "title": f"{dept} {rng.choice(['Officer', 'Manager', 'Analyst'])}", "type": "human", "status": "active",
             "account_enabled": True, "mfa_enabled": True, "pam_managed": dept in PRIV_DEPTS,
             "last_access_review": d(rng.randint(10, 170)), "entitlements": []}
        if rng.random() < .03:
            e.update(status="terminated", account_enabled=False, termination_date=d(rng.randint(5, 300)))
        elif dept in PRIV_DEPTS:
            role, types = {"DBA": ("dba", ("database",)), "IT-Infra": ("admin", ("server", "network", "application", "cloud_instance")),
                           "Security": ("admin", ("firewall", "server"))}[dept]
            for a in pick(DEPT_ZONES[dept], types, rng.randint(1, 3)):
                e["entitlements"].append({"asset_id": a["id"], "role": role, "granted": d(rng.randint(30, 700)), "ticket": f"CHG-{rng.randint(1000, 9999)}"})
        else:
            for a in pick(DEPT_ZONES.get(dept, ["corporate-it"]), None, rng.randint(1, 3)):
                e["entitlements"].append({"asset_id": a["id"], "role": rng.choice(["read", "operator"]), "granted": d(rng.randint(30, 700)), "ticket": f"REQ-{rng.randint(1000, 9999)}"})
        emps.append(e)
    for i in range(1, 9):
        a = pick(["core-banking", "payments"], ("server", "application"), 1)[0]
        emps.append({"id": f"SVC-{i:02d}", "name": f"svc-batch-{i:02d}", "email": None, "dept": "IT-Infra", "title": "service account",
                     "type": "service", "status": "active", "account_enabled": True, "mfa_enabled": False, "pam_managed": True,
                     "last_access_review": d(rng.randint(10, 150)),
                     "entitlements": [{"asset_id": a["id"], "role": "operator", "granted": d(200), "ticket": "CHG-0001"}]})

    # --- vendors
    vendors, vsa = [], [a for a in assets if a["type"] == "vendor_service"]
    for i in range(1, 41):
        crit = rng.choices(["critical", "important", "standard"], [25, 35, 40])[0]
        v = {"id": f"VND-{i:02d}", "name": f"Vendor Synth {i:02d}", "service": rng.choice(["core-banking-platform", "card-switch", "cloud-hosting", "soc-mssp", "payment-gateway", "kyc-api", "managed-network", "atm-managed-service"]),
             "criticality": crit, "has_audit_clause": True, "exit_plan": True, "data_access": rng.choice(["none", "limited", "pii"]),
             "last_assessment": d(rng.randint(30, 330)), "assets": []}
        vendors.append(v)
    for a in vsa:
        v = rng.choice(vendors); a["vendor_id"] = v["id"]; v["assets"].append(a["id"])

    # --- crypto bill of materials
    crypto, n = [], 0
    def add(a, kind, alg, bits, usage, **kw):
        nonlocal n; n += 1
        crypto.append({"id": f"CRY-{n:05d}", "asset_id": a["id"], "asset_criticality": a["criticality"], "kind": kind, "algorithm": alg,
                       "key_bits": bits, "protocol_version": kw.get("pv"), "usage": usage, "expiry": kw.get("expiry"),
                       "data_lifetime_years": kw.get("life", 1), "hybrid": kw.get("hybrid", False), "crypto_agile": True, "pqc_plan": kw.get("plan", True)})
    for a in assets:
        if a["type"] not in ("application", "server", "firewall", "database", "hsm", "storage_bucket") or not (a["criticality"] >= 3 or a["internet_facing"]): continue
        add(a, "protocol", "TLS", None, "transport", pv=rng.choice(["TLS1.3", "TLS1.2"]))
        if a["type"] in ("application", "server", "firewall"):
            alg, bits, hyb = rng.choices(CERT_ALGS, [45, 25, 20, 10])[0]
            life = rng.choice([1, 3, 5, 10, 15, 20]); q = alg.startswith(("RSA", "ECDSA")) and not hyb
            plan = True if (a["criticality"] >= 4 and life >= 10) else (rng.random() < .4 if q else True)
            add(a, "certificate", alg, bits, "server-auth", expiry=fut(rng.randint(30, 700)), life=life, hybrid=hyb, plan=plan)
            add(a, "hash", "SHA-256", 256, "integrity")
        if a["type"] in ("database", "hsm", "storage_bucket"):
            add(a, "key", "AES-256", 256, "data-at-rest", life=rng.choice([5, 10, 15]))

    # --- governance
    policies = [{"id": f"POL-{i:02d}", "title": t, "owner": rng.choice(["CISO", "CRO", "CTO"]), "last_review": d(rng.randint(30, 330)),
                 "approved_by": "Board IT Strategy Committee", "review_cycle_months": 12} for i, t in enumerate(POLICY_TITLES, 1)]
    ir = {"playbooks": list(REQUIRED_PLAYBOOKS), "last_drill_date": d(90), "last_tabletop": d(120),
          "regulator_reporting_procedure": True, "mttc_target_hours": 4, "contacts_verified": d(60)}
    backups = []
    for a in assets:
        if a["criticality"] >= 4 and a["type"] in ("server", "database", "application"):
            backups.append({"asset_id": a["id"], "criticality": a["criticality"], "last_backup": d(rng.randint(0, 1)),
                            "last_restore_test": d(rng.randint(20, 300)), "rpo_hours": 4, "rto_hours": 8,
                            "dr_replica": True, "offsite": True, "immutable": True})
    discovered = [{"host_id": f"HOST-{i:05d}", "hostname": a["name"].lower(), "asset_id": a["id"], "exempt": False}
                  for i, a in enumerate(assets, 1) if a["type"] in ("server", "database", "application", "cloud_instance", "network", "firewall")]

    # --- activity
    sw_assets = [a for a in assets if a["zone"] in ("payments", "atm-switch", "internet-banking", "mobile-banking") and a["type"] in ("application", "server")] or assets[:5]
    chan = [("UPI", 45), ("IMPS", 15), ("NEFT", 12), ("RTGS", 3), ("CARD", 15), ("NETBANKING", 10)]
    accts = [f"AC{rng.randint(10**9, 10**10 - 1)}" for _ in range(max(500, n_tx // 4))]
    txs, tot = [], {}
    for i in range(1, n_tx + 1):
        ch = rng.choices([c for c, _ in chan], [w for _, w in chan])[0]
        amt = round(rng.uniform(2e5, 5e7), 2) if ch == "RTGS" else round(min(max(rng.lognormvariate(7.5, 1.4), 10), 2e6), 2)
        sa = rng.choice(sw_assets); tot[sa["id"]] = tot.get(sa["id"], 0) + amt
        txs.append({"id": f"TXN-{i:07d}", "ts": f"{d(rng.randint(0, 90))}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00Z", "channel": ch,
                    "amount_inr": amt, "src": rng.choice(accts), "dst": rng.choice(accts), "status": rng.choices(["success", "failed", "reversed"], [96, 3, 1])[0], "switch_asset_id": sa["id"]})
    am = {a["id"]: a for a in assets}
    for k, v in tot.items(): am[k]["daily_txn_value_inr"] = round(v / 90, 2)
    w = [a["criticality"] for a in assets]; events = []
    for i in range(1, n_ev + 1):
        a = rng.choices(assets, w)[0]; sev = rng.choices([1, 2, 3, 4], [3, 10, 30, 57])[0]
        e = {"id": f"EVT-{i:06d}", "ts": f"{d(rng.randint(0, 90))}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00Z", "asset_id": a["id"],
             "type": rng.choice(EVT_TYPES), "severity": sev, "detected_by": rng.choice(["SIEM", "EDR", "NDR", "manual"])}
        if sev <= 2: e["contained_hours"] = round(rng.uniform(.3, 3.5), 1)
        events.append(e)
    return {"assets": assets, "employees": emps, "vendors": vendors, "crypto": crypto, "policies": policies, "ir_plan": ir,
            "backups": backups, "discovered_hosts": discovered, "transactions": txs, "events": events, "vuln_db": SOFT}
