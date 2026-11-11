"""Step 1a (v0.2): reproducible synthetic baseline of a large Indian public-sector-bank-style estate
(compliant by construction), then scenario injection. Bank, vendors and people are fictional."""
import datetime as dt
import random
from itertools import accumulate
from .common import *
from .catalog import *
from . import scenarios, evidence as ev

# scale 1.0 == the profile's nominal size. large_psb ~5k assets / 4k staff / 800 sampled branches.
PROFILES = {
    "large_psb": dict(circles=12, branches=800, core=1800, emps=4000, tx=60000, events=15000, vendors=180, pcs=2.5, atms=.6),
    "mid_bank":  dict(circles=4,  branches=150, core=700,  emps=1200, tx=20000, events=6000,  vendors=40,  pcs=2.0, atms=.5),
}
CIRCLES = [("Chandigarh", ["Chandigarh", "Ludhiana", "Amritsar", "Shimla"]), ("Delhi", ["New Delhi", "Gurugram", "Noida", "Faridabad"]),
           ("Lucknow", ["Lucknow", "Kanpur", "Varanasi", "Agra"]), ("Kolkata", ["Kolkata", "Howrah", "Siliguri", "Durgapur"]),
           ("Bhubaneswar", ["Bhubaneswar", "Cuttack", "Rourkela", "Puri"]), ("Patna", ["Patna", "Gaya", "Muzaffarpur", "Ranchi"]),
           ("Bhopal", ["Bhopal", "Indore", "Jabalpur", "Gwalior"]), ("Ahmedabad", ["Ahmedabad", "Surat", "Vadodara", "Rajkot"]),
           ("Mumbai", ["Mumbai", "Thane", "Nashik", "Nagpur"]), ("Hyderabad", ["Hyderabad", "Warangal", "Vijayawada", "Visakhapatnam"]),
           ("Bengaluru", ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru"]), ("Thiruvananthapuram", ["Thiruvananthapuram", "Kochi", "Kozhikode", "Chennai"])]
AREAS = ["Main", "Civil Lines", "Model Town", "Industrial Area", "Mandi", "Station Road", "Cantonment", "New Market", "Sector 9", "Old City"]
TIER, TIER_W = ["metro", "urban", "semi-urban", "rural"], [8, 24, 30, 38]
TIER_MULT = {"metro": 2.2, "urban": 1.4, "semi-urban": 1.0, "rural": .6}

FIRST = ["Aarav", "Vihaan", "Aditya", "Ananya", "Diya", "Isha", "Kabir", "Meera", "Rohan", "Saanvi", "Arjun", "Kavya", "Neha", "Rahul", "Priya",
         "Sanjay", "Tara", "Vikram", "Zoya", "Harpreet", "Gurpreet", "Simran", "Manpreet", "Lakshmi", "Farhan", "Suresh", "Ramesh", "Anita", "Sunita",
         "Deepak", "Pooja", "Amit", "Sneha", "Rajesh", "Kiran", "Mohan", "Geeta", "Ashok", "Rekha", "Vivek", "Divya", "Karthik", "Swati", "Nikhil",
         "Pallavi", "Imran", "Fatima", "Joseph", "Mary", "Abhishek", "Sourav", "Debashish", "Nandini", "Bhaskar", "Jasleen", "Tejas", "Ritu", "Naveen"]
LAST = ["Sharma", "Verma", "Gill", "Singh", "Patel", "Iyer", "Nair", "Reddy", "Khan", "Das", "Mehta", "Joshi", "Kapoor", "Bose", "Chopra", "Malhotra",
        "Sethi", "Rao", "Menon", "Bhatia", "Gupta", "Agarwal", "Mishra", "Pandey", "Yadav", "Chatterjee", "Banerjee", "Mukherjee", "Pillai", "Naidu",
        "Kulkarni", "Deshmukh", "Jadhav", "Shah", "Desai", "Thakur", "Chauhan", "Sinha", "Tiwari", "Dhillon", "Sandhu", "Kaur", "D'Souza", "Fernandes",
        "Ansari", "Qureshi", "Hegde", "Shetty", "Mohanty", "Patnaik"]
GRADES = ["Clerical", "JMGS-I", "MMGS-II", "MMGS-III", "SMGS-IV", "SMGS-V", "TEGS-VI", "TEGS-VII"]
GRADE_W = [38, 30, 14, 8, 5, 3, 1.5, .5]
ROLE = {"Clerical": "Clerk", "JMGS-I": "Officer", "MMGS-II": "Manager", "MMGS-III": "Senior Manager", "SMGS-IV": "Chief Manager",
        "SMGS-V": "AGM", "TEGS-VI": "DGM", "TEGS-VII": "GM"}
EMP_DEPT_W = [("IT-Infra", 3.5), ("DBA", 1.2), ("Security", 2), ("Retail Banking", 38), ("Treasury", 3), ("Operations", 30), ("Compliance", 3),
              ("Audit", 3), ("HR", 3), ("Finance", 4), ("Digital Channels", 5), ("Payments Ops", 4.3)]
BRANCH_DEPTS = {"Retail Banking", "Operations"}

SYSTEMS = {"core-banking": ["CBS-APP", "CBS-BATCH", "CBS-MQ", "CKYC", "TREASURY", "GL-RECON", "LOANS"],
           "payments": ["UPI-SWITCH", "IMPS-SWITCH", "NEFT-RTGS-GW", "SWIFT-GW", "CTS-CLEARING", "AEPS-GW", "BBPS"],
           "atm-switch": ["ATM-SWITCH", "CARD-MGMT", "POS-GW", "CDM-MGMT", "PIN-AUTH"],
           "internet-banking": ["INB-WEB", "INB-APP", "WAF", "API-GW", "CORP-INB"],
           "mobile-banking": ["MOB-BE", "MOB-API-GW", "PUSH-SVC", "DEVICE-BIND", "UPI-PSP"],
           "corporate-it": ["AD-DS", "MAIL", "HRMS", "ITSM", "PATCH-MGR", "DMS", "SHAREPOINT"],
           "cloud-workloads": ["DATA-LAKE", "ANALYTICS", "CRM", "CHATBOT", "RPA"],
           "dr-site": ["DR-CBS", "DR-UPI", "DR-INB", "DR-DB"],
           "security-tooling": ["SIEM", "SOAR", "PAM", "EDR-MGR", "NDR", "VA-SCANNER"]}
TYPE_PFX = {"endpoint": "HOPC", "network": "NET", "firewall": "FW", "hsm": "HSM", "storage_bucket": "STORE", "vendor_service": "SAAS", "cloud_instance": "VM"}
SITE = {"DC-PRIMARY": "DC1", "DC-DR": "DR1", "CLOUD-REGION-A": "CLD", "BRANCH": "BR"}

VENDOR_PFX = ["Aranya", "Kestrel", "Meridian", "Zenith", "Pinnacle", "Tarang", "Orbit", "Sagar", "Vajra", "Lumen", "Nexora", "Cobalt", "Indus", "Kaveri",
              "Himal", "Sutra", "Vertex", "Prabha", "Anvaya", "Trident", "Chakra", "Navya", "Samarth", "Quantra", "Ekta", "Dhruv", "Arohan", "Setu", "Pragati", "Veda"]
VENDOR_SFX = ["Infotech", "Payments", "Networks", "Managed Services", "Cloud", "Technologies", "Secure", "Data Centres", "Telecom", "Systems", "Solutions", "Digital"]
SERVICE_W = {"core-banking-platform": 1, "card-switch": 2, "cloud-hosting": 6, "soc-mssp": 4, "payment-gateway": 6, "kyc-api": 8, "managed-network": 10,
             "atm-managed-service": 8, "si-implementation": 14, "cash-logistics": 6, "telecom-mpls": 6, "dc-colocation": 4, "cheque-clearing": 3,
             "card-personalization": 3, "call-centre": 8, "audit-forensics": 5, "software-licensing": 6}
CRITICAL_SVC = {"core-banking-platform", "card-switch", "cloud-hosting", "payment-gateway", "atm-managed-service", "managed-network", "soc-mssp"}
REMOTE_SVC = {"atm-managed-service", "managed-network", "soc-mssp", "core-banking-platform", "si-implementation", "card-switch"}  # vendors with privileged remote access (via PAM in the baseline)

SVC_SFX = {"core-banking-platform": ["Systems", "Technologies"], "card-switch": ["Payments", "Systems"], "cloud-hosting": ["Cloud", "Data Centres"],
           "soc-mssp": ["Secure", "Managed Services"], "payment-gateway": ["Payments", "Digital"], "kyc-api": ["Digital", "Solutions"],
           "managed-network": ["Networks", "Managed Services"], "atm-managed-service": ["Managed Services", "Technologies"],
           "si-implementation": ["Infotech", "Solutions", "Technologies"], "cash-logistics": ["Solutions", "Managed Services"],
           "telecom-mpls": ["Telecom", "Networks"], "dc-colocation": ["Data Centres", "Cloud"], "cheque-clearing": ["Systems", "Solutions"],
           "card-personalization": ["Technologies", "Secure"], "call-centre": ["Managed Services", "Solutions"],
           "audit-forensics": ["Secure", "Solutions"], "software-licensing": ["Systems", "Infotech"]}
CERT_ALGS = [("RSA", 3072, False), ("RSA", 2048, False), ("ECDSA-P384", 384, False), ("ECDSA-P384+ML-DSA-65", 384, True)]
EVT_TYPES = ["auth_failure", "malware_alert", "policy_violation", "port_scan", "privilege_change", "config_change", "dlp_alert"]
EVT_W = [32, 8, 14, 18, 8, 14, 6]
HOUR_W = [1, .5, .3, .3, .3, .5, 1, 2, 3, 5, 7, 8, 8, 7, 6, 6, 6, 7, 8, 8, 7, 5, 3, 2]
CHAN = [("UPI", 62), ("IMPS", 8), ("NEFT", 6), ("RTGS", .6), ("CARD", 14), ("NETBANKING", 9.4)]


def generate(seed=42, scale=1.0, profile="large_psb"):
    rng = random.Random(seed)
    P = PROFILES[profile]
    ds = _baseline(rng, scale, P)
    ds["meta"] = {"name": "Vestro Bank of India (synthetic)", "synthetic": True, "seed": seed, "scale": scale, "profile": profile,
                  "as_of": AS_OF.isoformat(), "generator_version": "0.3.0", "disclaimer": DISCLAIMER}
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
    ds["counts"]["branches"] = len(ds["org"]["branches"])
    return ds


def _org(rng, k, n_br):
    cs = CIRCLES[:k]; w = [rng.uniform(.6, 2.0) for _ in cs]
    circles = [{"name": c, "lho": f"LHO {c}", "regions": [f"{c} Region {r}" for r in range(1, 4)]} for c, _ in cs]
    brs = []
    for i in range(1, n_br + 1):
        ci = rng.choices(range(len(cs)), w)[0]; c, cities = cs[ci]
        brs.append({"id": f"BR-{i:04d}", "ifsc": f"VSTB0{i:06d}", "name": f"{rng.choice(cities)} {rng.choice(AREAS)}", "circle": c,
                    "region": rng.choice(circles[ci]["regions"]), "tier": rng.choices(TIER, TIER_W)[0]})
    return {"circles": circles, "branches": brs}


def _baseline(rng, scale, P):
    n_core, n_emp = max(150, int(P["core"] * scale)), max(150, int(P["emps"] * scale))
    n_tx, n_ev = max(2000, int(P["tx"] * scale)), max(600, int(P["events"] * scale))
    n_br, n_vnd = max(20, int(P["branches"] * scale)), max(40, int(P["vendors"] * scale))
    org = _org(rng, P["circles"], n_br); brs = org["branches"]
    tys, tws = [t for t, _ in TYPE_W], [w for _, w in TYPE_W]
    zs, zws = [z for z, _ in ZONE_W], [w for _, w in ZONE_W]
    assets = []

    def mk(t, z, crit, loc, pfx, system, dept, branch=None, internet=False):
        i = len(assets) + 1
        names = SW_BY_TYPE.get(t, [])
        sw = [{"name": n, "version": SOFT[n]["current"]} for n in rng.sample(names, min(len(names), rng.randint(1, 2) if not branch else 1))]
        if branch and sw: sw[0]["eol_date"] = fut(rng.randint(120, 1200))   # supported today; defects pull this into the past
        a = {"id": f"AST-{i:05d}", "name": f"{pfx}-{SITE[loc]}-{i:05d}" if not branch else f"{pfx}-{i:05d}", "type": t, "zone": z, "criticality": crit,
             "environment": "prod", "location": loc, "owner_dept": dept, "vendor_id": None, "internet_facing": internet, "software": sw,
             "daily_txn_value_inr": 0.0, "system": system, "branch_id": branch,
             "config": {"encrypted_at_rest": True, "default_credentials": False, "public_access": False, "logging_enabled": True,
                        "classification": "confidential" if crit >= 4 else "internal"}}
        assets.append(a); return a

    # --- core estate: DC / DR / cloud / HO
    for _ in range(n_core):
        t, z = rng.choices(tys, tws)[0], rng.choices(zs, zws)[0]
        if t == "endpoint": z = rng.choices(["corporate-it", "core-banking"], [85, 15])[0]
        crit = ZONE_CRIT[z]
        if t == "endpoint": crit = min(crit, 2)
        crit = max(1, min(5, crit + rng.choice([0, 0, 0, -1])))
        loc = "DC-DR" if z == "dr-site" else "CLOUD-REGION-A" if (t == "cloud_instance" or z == "cloud-workloads") else rng.choices(["DC-PRIMARY", "DC-DR"], [80, 20])[0]
        sysn = rng.choice(SYSTEMS[z])
        pfx = TYPE_PFX.get(t) or (sysn + "-DB" if t == "database" else sysn)
        mk(t, z, crit, loc, pfx, "HO-DESKTOP" if t == "endpoint" else sysn, ZONE_DEPT[z],
           internet=z in ("internet-banking", "mobile-banking") and t in ("application", "server", "firewall") and rng.random() < .5)
    # --- branch estate: router, PCs, ATMs
    for b in brs:
        m = TIER_MULT[b["tier"]]
        mk("network", "corporate-it", rng.choice([2, 2, 1]), "BRANCH", f"{b['id']}-RTR", "BRANCH-ROUTER", "Operations", b["id"])
        for _ in range(int(P["pcs"] * m + rng.random())):
            mk("endpoint", "corporate-it", rng.choice([2, 2, 1]), "BRANCH", f"{b['id']}-PC", "BRANCH-PC", "Operations", b["id"])
        for _ in range(int(P["atms"] * m + rng.random())):
            mk("endpoint", "atm-switch", rng.choice([2, 2, 1]), "BRANCH", f"{b['id']}-ATM", "ATM", "Operations", b["id"])
    by_zone = {}
    for a in assets: by_zone.setdefault(a["zone"], []).append(a)
    _pc = {}

    def pick(zones, types, k):
        kk = (tuple(zones), types)
        if kk not in _pc:
            _pc[kk] = [a for z in zones for a in by_zone.get(z, []) if not a["branch_id"] and (a["type"] in types if types else a["type"] != "endpoint")] \
                      or [a for a in assets if not a["branch_id"]]
        pool = _pc[kk]; return rng.sample(pool, min(k, len(pool)))

    # --- identities
    depts, dws = [x for x, _ in EMP_DEPT_W], [w for _, w in EMP_DEPT_W]
    bw = [TIER_MULT[b["tier"]] for b in brs]; cnames = [c["name"] for c in org["circles"]]
    emps = []
    for i in range(1, n_emp + 1):
        dept = rng.choices(depts, dws)[0]; f, l = rng.choice(FIRST), rng.choice(LAST); branchy = dept in BRANCH_DEPTS
        gw = GRADE_W[:]; gw[0] = 0 if dept in PRIV_DEPTS else (38 if branchy else 8)
        grade = rng.choices(GRADES, gw)[0]
        if branchy:
            b = rng.choices(brs, bw)[0]; bid, circ, office = b["id"], b["circle"], b["id"]
        else:
            circ = rng.choice(cnames) if rng.random() < .55 else "HO"; bid = None; office = "HO" if circ == "HO" else f"LHO {circ}"
        e = {"id": f"EMP-{i:04d}", "name": f"{f} {l}", "email": f"{f}.{l}{i}@vestro.example".lower().replace("'", ""), "dept": dept,
             "title": f"{dept} {ROLE[grade]}", "grade": grade, "branch_id": bid, "circle": circ, "office": office,
             "employment": "outsourced" if (dept in PRIV_DEPTS or dept == "Operations") and rng.random() < .07 else "regular",
             "type": "human", "status": "active", "account_enabled": True, "mfa_enabled": True, "pam_managed": dept in PRIV_DEPTS,
             "last_access_review": d(rng.randint(10, 170)), "last_login": d(rng.randint(0, 45)), "entitlements": []}
        if rng.random() < .03:
            t = rng.randint(5, 300); e.update(status="terminated", account_enabled=False, termination_date=d(t), last_login=d(t + rng.randint(0, 5)))
        elif dept in PRIV_DEPTS:
            role, types = {"DBA": ("dba", ("database",)), "IT-Infra": ("admin", ("server", "network", "application", "cloud_instance")),
                           "Security": ("admin", ("firewall", "server"))}[dept]
            for a in pick(DEPT_ZONES[dept], types, rng.randint(1, 3)):
                e["entitlements"].append({"asset_id": a["id"], "role": role, "granted": d(rng.randint(30, 700)), "ticket": f"CHG-{rng.randint(1000, 9999)}"})
        else:
            # branch/ops staff work in maker-checker flows on CBS apps; distinct assets per person, so never both roles on one system
            roles, rw, types = (["read", "operator", "maker", "checker"], [30, 25, 30, 15], ("application", "server")) if branchy else (["read", "operator"], [1, 1], None)
            for a in pick(DEPT_ZONES.get(dept, ["corporate-it"]), types, rng.randint(1, 3)):
                e["entitlements"].append({"asset_id": a["id"], "role": rng.choices(roles, rw)[0], "granted": d(rng.randint(30, 700)), "ticket": f"REQ-{rng.randint(1000, 9999)}"})
        emps.append(e)
    for i in range(1, max(8, int(30 * scale)) + 1):
        a = pick(["core-banking", "payments"], ("server", "application"), 1)[0]
        emps.append({"id": f"SVC-{i:02d}", "name": f"svc-batch-{i:02d}", "email": None, "dept": "IT-Infra", "title": "service account", "grade": None,
                     "branch_id": None, "circle": "HO", "office": "DC", "employment": "regular", "type": "service", "status": "active",
                     "account_enabled": True, "mfa_enabled": False, "pam_managed": True, "last_access_review": d(rng.randint(10, 150)), "last_login": d(rng.randint(0, 3)),
                     "entitlements": [{"asset_id": a["id"], "role": "operator", "granted": d(200), "ticket": "CHG-0001"}]})

    # --- vendors (fictional), service-skewed with concentration + fourth parties
    services = list(SERVICE_W); sw_ = list(SERVICE_W.values())
    vendors, vsa, used = [], [a for a in assets if a["type"] == "vendor_service"], set()
    for i in range(1, n_vnd + 1):
        svc = services[i - 1] if i <= len(services) else rng.choices(services, sw_)[0]
        for _ in range(50):
            nm = f"{rng.choice(VENDOR_PFX)} {rng.choice(SVC_SFX.get(svc, VENDOR_SFX))} Pvt Ltd"
            if nm not in used: break
        used.add(nm); crit_svc = svc in CRITICAL_SVC
        hc = "IN" if rng.random() < .93 else rng.choice(["SG", "US", "IE"])
        da = rng.choices(["none", "limited", "pii"], [5, 35, 60] if crit_svc else [40, 40, 20])[0]
        if hc != "IN" and da == "pii": da = "limited"          # baseline honours data localisation: no PII/payment data offshore
        vendors.append({"id": f"VND-{i:02d}", "name": nm, "service": svc,
                        "criticality": rng.choices(["critical", "important", "standard"], [60, 30, 10] if crit_svc else [8, 32, 60])[0],
                        "has_audit_clause": True, "exit_plan": True, "data_access": da,
                        "last_assessment": d(rng.randint(30, 330)), "hosting_country": hc,
                        "remote_access": {"enabled": True, "privileged": True, "via_pam": True} if svc in REMOTE_SVC
                                         else {"enabled": rng.random() < .3, "privileged": False, "via_pam": True},
                        "subcontractors": [], "assets": []})
    infra = [v["id"] for v in vendors if v["service"] in ("cloud-hosting", "dc-colocation", "telecom-mpls")]
    for v in vendors:
        if infra and rng.random() < .5: v["subcontractors"] = sorted(set(rng.sample(infra, min(len(infra), rng.randint(1, 2)))) - {v["id"]})
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
          "regulator_reporting_procedure": True, "mttc_target_hours": 4, "contacts_verified": d(60), "last_dr_drill": d(150)}
    backups = []
    for a in assets:
        if a["criticality"] >= 4 and a["type"] in ("server", "database", "application"):
            backups.append({"asset_id": a["id"], "criticality": a["criticality"], "last_backup": d(rng.randint(0, 1)),
                            "last_restore_test": d(rng.randint(20, 300)), "rpo_hours": 4, "rto_hours": 8,
                            "dr_replica": True, "offsite": True, "immutable": True})
    discovered = [{"host_id": f"HOST-{i:05d}", "hostname": a["name"].lower(), "asset_id": a["id"], "exempt": False}
                  for i, a in enumerate(assets, 1) if a["type"] in ("server", "database", "application", "cloud_instance", "network", "firewall")]

    # --- activity: UPI-heavy, per-channel ticket sizes, salary-day + peak-hour seasonality, skewed account activity
    sw_assets = [a for a in assets if a["zone"] in ("payments", "atm-switch", "internet-banking", "mobile-banking") and a["type"] in ("application", "server") and not a["branch_id"]] or assets[:5]
    def sw(zones): return [a for z in zones for a in by_zone.get(z, []) if a["type"] in ("application", "server") and not a["branch_id"]] or sw_assets
    SW = {c: sw(["payments"]) for c in ("UPI", "IMPS", "NEFT", "RTGS")}; SW["CARD"] = sw(["atm-switch"]); SW["NETBANKING"] = sw(["internet-banking", "mobile-banking"])
    def amt(ch):
        if ch == "UPI": return min(max(rng.lognormvariate(5.9, 1.2), 1), 1e5)
        if ch == "IMPS": return min(max(rng.lognormvariate(7.6, 1.3), 1), 5e5)
        if ch == "NEFT": return min(max(rng.lognormvariate(9.2, 1.7), 1), 5e7)
        if ch == "RTGS": return min(2e5 * rng.paretovariate(1.1), 5e8)
        if ch == "CARD": return min(max(rng.lognormvariate(7.0, 1.2), 10), 5e5)
        return min(max(rng.lognormvariate(8.3, 1.5), 10), 2e6)
    days = [AS_OF - dt.timedelta(days=k) for k in range(91)]
    dcw = list(accumulate((1.8 if (x.day <= 4 or x.day >= 28) else 1.0) * (.7 if x.weekday() == 6 else 1.0) for x in days))
    dk = rng.choices(range(91), cum_weights=dcw, k=n_tx); hk = rng.choices(range(24), HOUR_W, k=n_tx)
    chs = rng.choices([c for c, _ in CHAN], [w for _, w in CHAN], k=n_tx)
    accts = [f"AC{rng.randint(10**10, 10**11 - 1)}" for _ in range(max(500, n_tx // 3))]
    na = len(accts); txs, tot = [], {}
    for i in range(1, n_tx + 1):
        ch = chs[i - 1]; a_ = round(amt(ch), 2); sa = rng.choice(SW[ch]); tot[sa["id"]] = tot.get(sa["id"], 0) + a_
        txs.append({"id": f"TXN-{i:07d}", "ts": f"{d(dk[i - 1])}T{hk[i - 1]:02d}:{rng.randint(0, 59):02d}:00Z", "channel": ch, "amount_inr": a_,
                    "src": accts[int(na * rng.random() ** 2)], "dst": accts[int(na * rng.random() ** 2)],
                    "status": rng.choices(["success", "failed", "reversed"], [97, 2.4, .6] if ch == "UPI" else [96, 3, 1])[0], "switch_asset_id": sa["id"]})
    am = {a["id"]: a for a in assets}
    for k, v in tot.items(): am[k]["daily_txn_value_inr"] = round(v / 90, 2)
    cw = list(accumulate(a["criticality"] for a in assets)); events = []
    for i, a in enumerate(rng.choices(assets, cum_weights=cw, k=n_ev), 1):
        sev = rng.choices([1, 2, 3, 4], [3, 10, 30, 57])[0]
        e = {"id": f"EVT-{i:06d}", "ts": f"{d(rng.randint(0, 90))}T{rng.choices(range(24), HOUR_W)[0]:02d}:{rng.randint(0, 59):02d}:00Z", "asset_id": a["id"],
             "type": rng.choices(EVT_TYPES, EVT_W)[0], "severity": sev, "detected_by": rng.choices(["SIEM", "EDR", "NDR", "manual"], [50, 25, 15, 10])[0]}
        if sev <= 2: e["contained_hours"] = round(rng.uniform(.3, 3.5), 1)
        events.append(e)
    return {"org": org, "assets": assets, "employees": emps, "vendors": vendors, "crypto": crypto, "policies": policies, "ir_plan": ir,
            "backups": backups, "discovered_hosts": discovered, "transactions": txs, "events": events, "vuln_db": SOFT}