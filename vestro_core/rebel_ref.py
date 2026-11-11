"""Step 1d: clients that stand in for Rebel's modules.
ReferenceRebel is a deterministic STAND-IN used to exercise the harness (optionally degraded with noise).
HttpRebelClient posts the same payloads to a real Rebel deployment. Route paths are placeholders - set to Rebel's real routes."""
import json, random, urllib.request, datetime as dt
from .common import *
from .catalog import *
from . import evidence as ev

MODULES = ["asset_inventory", "cbom", "pqc_readiness", "cyber_rating", "evidence_intelligence", "compliance_mapping"]


class ReferenceRebel:
    name = "reference-rebel (stand-in)"
    def __init__(self, miss_rate=0.0, fp_rate=0.0, overclaim_rate=0.0, seed=7):
        self.miss, self.fp, self.over, self.rng = miss_rate, fp_rate, overclaim_rate, random.Random(seed)

    def call(self, module, p):
        self.p, self.as_of = p, dt.date.fromisoformat(p["as_of"]); self.found = []
        extra = getattr(self, "_" + module)(p) or {}
        fs = self._noise(module, self.found)
        return {"findings": fs, **extra}

    def _f(self, cat, ref, desc, asset_id=None, sev=None):
        m = SCEN[cat]; n = ev.needed(cat, asset_id); ids = ev.supports(self.p["evidence"], *n, as_of=self.as_of) if n else []
        verified = n is None or bool(ids)
        lim = [] if verified else [f"No current system-sourced '{n[0]}' evidence for {n[1]}; finding rests on inventory/CMDB attributes (assumption)."]
        self.found.append({"module": m["module"], "category": cat, "entity_ref": ref, "severity": sev or m["severity"], "asset_id": asset_id,
                           "description": desc, "status": "verified" if verified else "assumed", "confidence": 0.95 if verified else 0.6,
                           "evidence_ids": ids[:3], "limitations": lim, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat()})

    def _noise(self, module, fs):
        out = [f for f in fs if self.rng.random() >= self.miss]
        for f in out:
            if f["status"] == "assumed" and self.rng.random() < self.over: f.update(status="verified", confidence=0.9, limitations=[])
        keys = {(f["category"], f["entity_ref"]) for f in fs}
        for _ in range(round(self.fp * len(fs))):
            if module == "cyber_rating":
                a = self.rng.choice(self.p["assets"]); c, r = "MISCONFIG_LOGGING_OFF", f"asset:{a['id']}"
            elif module == "cbom":
                x = self.rng.choice(self.p["crypto"]); c, r = "CRYPTO_WEAK_ALGO", f"crypto:{x['id']}"
            elif module == "compliance_mapping":
                x = self.rng.choice(self.p["policies"]); c, r = "POLICY_OUTDATED", f"policy:{x['id']}"
            else: continue
            if (c, r) in keys: continue
            keys.add((c, r)); self.found = []; self._f(c, r, "Possible issue (low-confidence)", r.split(":")[1] if r.startswith("asset") else None); out += self.found
        return out

    def _asset_inventory(self, p):
        un = [h for h in p["discovered_hosts"] if h["asset_id"] is None and not h.get("exempt")]
        for h in un: self._f("ASSET_UNMANAGED", f"host:{h['host_id']}", f"{h['hostname']} discovered but not in inventory")
        return {"summary": {"assets": len(p["assets"]), "discovered": len(p["discovered_hosts"]), "unmanaged": len(un),
                            "coverage_pct": round(100 * (1 - len(un) / max(1, len(p["discovered_hosts"]))), 1)}}

    def _cbom(self, p):
        kinds = {}
        for c in p["crypto"]:
            kinds[c["algorithm"]] = kinds.get(c["algorithm"], 0) + 1
            if crypto_weak(c): self._f("CRYPTO_WEAK_ALGO", f"crypto:{c['id']}", f"{c['kind']} uses {c['algorithm']} {c.get('protocol_version') or ''}".strip(), c["asset_id"])
            if c["kind"] == "certificate" and c["expiry"] and to_date(c["expiry"]) < self.as_of: self._f("CRYPTO_CERT_EXPIRED", f"crypto:{c['id']}", f"Certificate expired {c['expiry']}", c["asset_id"])
        return {"summary": {"components": len(p["crypto"]), "by_algorithm": kinds}}

    def _pqc_readiness(self, p):
        pk = [c for c in p["crypto"] if c["kind"] == "certificate"]; vuln = [c for c in pk if qvulnerable(c)]
        gap = [c for c in vuln if c["asset_criticality"] >= 4 and c["data_lifetime_years"] >= 10 and not c["pqc_plan"]]
        for c in gap: self._f("CRYPTO_PQC_NO_PLAN", f"crypto:{c['id']}", f"{c['algorithm']} protects {c['data_lifetime_years']}y data; no PQC plan", c["asset_id"])
        prot = len(pk) - len(vuln); planned = sum(1 for c in vuln if c["pqc_plan"])
        return {"summary": {"public_key_components": len(pk), "quantum_vulnerable": len(vuln), "hybrid_or_pq": prot, "with_plan": planned,
                            "high_risk_unplanned": len(gap), "score": round(100 * (prot + .5 * planned) / max(1, len(pk)), 1)}}

    def _cyber_rating(self, p):
        A = {a["id"]: a for a in p["assets"]}
        for e in p["identities"]:
            priv = [x for x in e["entitlements"] if x["role"] in PRIV_ROLES]; hum = e["type"] == "human" and e["status"] == "active"
            if hum and e["dept"] not in PRIV_DEPTS:
                for x in priv:
                    if A.get(x["asset_id"], {}).get("criticality", 0) >= 4: self._f("PRIV_EXCESSIVE_ADMIN", f"emp:{e['id']}:asset:{x['asset_id']}", f"{e['dept']} user holds {x['role']} on critical asset", x["asset_id"])
            if e["type"] == "shared" and priv: self._f("PRIV_SHARED_ACCOUNT", f"emp:{e['id']}", "Shared account holds privileged role", priv[0]["asset_id"])
            if e["status"] == "terminated" and e["account_enabled"]: self._f("PRIV_TERMINATED_ACTIVE", f"emp:{e['id']}", "Leaver account enabled")
            if hum and priv and not e["mfa_enabled"]: self._f("PRIV_NO_MFA_ADMIN", f"emp:{e['id']}", "Privileged user without MFA")
            if hum and priv and age_days(e["last_access_review"], self.as_of) > 180: self._f("PRIV_STALE_REVIEW", f"emp:{e['id']}", f"Last review {e['last_access_review']}")
            if hum and e.get("last_login") and e["account_enabled"] and age_days(e["last_login"], self.as_of) > 90: self._f("PRIV_DORMANT_ACCOUNT", f"emp:{e['id']}", f"No login since {e['last_login']}")
            if hum:
                by = {}
                for x in e["entitlements"]: by.setdefault(x["asset_id"], set()).add(x["role"])
                for aid, rs in by.items():
                    if {"maker", "checker"} <= rs: self._f("PRIV_MAKER_CHECKER_SOD", f"emp:{e['id']}:asset:{aid}", "Maker and checker roles held by one user", aid)
        for a in p["assets"]:
            for sw in a["software"]:
                i = p["vuln_db"][sw["name"]]
                if vtuple(sw["version"]) < vtuple(i["fixed"]): self._f("VULN_SOFTWARE", f"asset:{a['id']}:{sw['name']}", f"{sw['name']} {sw['version']} < {i['fixed']} ({i['vuln_id']})", a["id"], sev_from_cvss(i["cvss"]))
                if sw.get("eol_date") and to_date(sw["eol_date"]) < self.as_of: self._f("ASSET_EOL_SOFTWARE", f"asset:{a['id']}:{sw['name']}", f"{sw['name']} past end of support {sw['eol_date']}", a["id"])
            k = a["config"]
            if k["public_access"] and k["classification"] != "public": self._f("MISCONFIG_PUBLIC_STORAGE", f"asset:{a['id']}", "Non-public data exposed publicly", a["id"])
            if not k["encrypted_at_rest"] and a["criticality"] >= 3: self._f("MISCONFIG_NO_ENCRYPTION", f"asset:{a['id']}", "No encryption at rest", a["id"])
            if k["default_credentials"]: self._f("MISCONFIG_DEFAULT_CREDS", f"asset:{a['id']}", "Default credentials", a["id"])
            if not k["logging_enabled"] and a["criticality"] >= 4: self._f("MISCONFIG_LOGGING_OFF", f"asset:{a['id']}", "Logging disabled", a["id"])
        for b in p["backups"]:
            aid = b["asset_id"]
            if age_days(b["last_restore_test"], self.as_of) > 365: self._f("BACKUP_RESTORE_UNTESTED", f"backup:{aid}", f"Last restore test {b['last_restore_test']}", aid)
            if not b["immutable"]: self._f("BACKUP_NOT_IMMUTABLE", f"backup:{aid}", "No immutable copy", aid)
            if b["criticality"] == 5 and not b["dr_replica"]: self._f("DR_NO_REPLICA", f"dr:{aid}", "No DR replica", aid)
        n = len(self.found); w = sum(SEV_W[f["severity"]] for f in self.found); import math
        rating = round(100 * math.exp(-w / max(50, len(p["assets"]) / 10)))
        return {"summary": {"rating": rating, "grade": "A" if rating >= 85 else "B" if rating >= 70 else "C" if rating >= 55 else "D" if rating >= 40 else "E",
                            "technical_findings": n, "method": "stand-in heuristic, not Rebel's CyberRating"}}

    def _evidence_intelligence(self, p):
        for r in p["evidence_requirements"]:
            m = [e for e in p["evidence"] if e["type"] == r["type"] and e["entity_ref"] == r["entity_ref"]]
            if not m: self._f("EVIDENCE_MISSING", f"evidence:{r['req_id']}", f"No {r['type']} for {r['entity_ref']}")
            elif age_days(max(e["collected_at"] for e in m), self.as_of) > r["max_age_days"]: self._f("EVIDENCE_STALE", f"evidence:{r['req_id']}", f"{r['type']} older than {r['max_age_days']}d")
        return {"summary": {"requirements": len(p["evidence_requirements"]), "evidence_items": len(p["evidence"]), "gaps": len(self.found)}}

    def _compliance_mapping(self, p):
        for x in p["policies"]:
            if age_days(x["last_review"], self.as_of) > 365: self._f("POLICY_OUTDATED", f"policy:{x['id']}", f"{x['title']} reviewed {x['last_review']}")
        ir = p["ir_plan"]
        for pb in p["required_playbooks"]:
            if pb not in ir["playbooks"]: self._f("IR_PLAYBOOK_MISSING", f"ir:playbook:{pb}", f"No {pb} playbook")
        if age_days(ir["last_drill_date"], self.as_of) > 365: self._f("IR_DRILL_STALE", "ir:drill", "No exercise within 12 months")
        if ir.get("last_dr_drill") and age_days(ir["last_dr_drill"], self.as_of) > 365: self._f("DR_DRILL_STALE", "ir:dr_drill", "No DR failover drill within 12 months")
        for e in p["events"]:
            if e["severity"] <= 2 and e.get("contained_hours", 0) > ir["mttc_target_hours"]: self._f("IR_SLOW_CONTAINMENT", f"event:{e['id']}", f"Contained in {e['contained_hours']}h", e["asset_id"], "high" if e["severity"] == 2 else "critical")
        for v in p["vendors"]:
            ra = v.get("remote_access") or {}
            if ra.get("enabled") and ra.get("privileged") and not ra.get("via_pam"): self._f("VENDOR_PRIVILEGED_REMOTE", f"vendor:{v['id']}", "Privileged vendor remote access outside PAM")
            if v.get("data_access") == "pii" and v.get("hosting_country", "IN") != "IN": self._f("VENDOR_DATA_OFFSHORE", f"vendor:{v['id']}", f"Customer/payment data hosted in {v['hosting_country']}")
            if v["criticality"] == "standard": continue
            if not v["has_audit_clause"]: self._f("VENDOR_NO_AUDIT_CLAUSE", f"vendor:{v['id']}", "No audit clause")
            if age_days(v["last_assessment"], self.as_of) > 365: self._f("VENDOR_ASSESSMENT_STALE", f"vendor:{v['id']}", f"Assessed {v['last_assessment']}")
        maps = {key(f["category"], f["entity_ref"]): SCEN[f["category"]]["controls"] for f in p.get("findings", []) + self.found}
        return {"mappings": maps, "summary": {"mapped": len(maps)}}


DEFAULT_PATHS = {"asset_inventory": "/api/v1/asset-inventory", "cbom": "/api/v1/cbom", "pqc_readiness": "/api/v1/pqc-readiness",
                 "cyber_rating": "/api/v1/cyber-rating", "evidence_intelligence": "/api/v1/evidence-intelligence",
                 "compliance_mapping": "/api/v1/compliance-mapping"}

class HttpRebelClient:
    """Expected response: {"findings":[{category, entity_ref, severity, status, confidence, evidence_ids?, ...}], "summary":{}, "mappings":{}}"""
    def __init__(self, base_url, token=None, paths=None, timeout=120):
        self.base, self.token, self.paths, self.timeout = base_url.rstrip("/"), token, {**DEFAULT_PATHS, **(paths or {})}, timeout
        self.name = f"rebel-http:{self.base}"
    def call(self, module, payload):
        req = urllib.request.Request(self.base + self.paths[module], json.dumps(payload).encode(), {"Content-Type": "application/json", **({"Authorization": f"Bearer {self.token}"} if self.token else {})})
        with urllib.request.urlopen(req, timeout=self.timeout) as r: out = json.load(r)
        if not isinstance(out.get("findings"), list): raise ValueError(f"{module}: response has no 'findings' list")
        return out