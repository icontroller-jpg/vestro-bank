"""Step 1c: evidence generation + the ingestion pipeline (validate -> hash -> dedupe -> classify freshness/trust)."""
from .common import *
from .catalog import *

REQUIRED_KEYS = ("type", "source", "entity_ref", "collected_at", "content")

def _fresh(e, as_of): return age_days(e["collected_at"], as_of) <= MAX_AGE.get(e["type"], 365)

def supports(items, etype, ref, as_of=AS_OF):
    """Ids of evidence that can turn a finding from 'assumed' into 'verified': system-sourced, fresh, integrity-checked."""
    return [e["id"] for e in items if e["type"] == etype and e["entity_ref"] == ref and e["source"] in TRUSTED_SOURCES
            and _fresh(e, as_of) and e.get("integrity_ok", True)]

def needed(category, asset_id):
    spec = SCEN[category]["evidence"]
    if not spec: return None
    etype, scope = spec
    return etype, (f"asset:{asset_id}" if scope == "asset" else f"feed:{etype}")

def expected_status(g, evidence):
    n = needed(g["category"], g.get("asset_id"))
    return "verified" if n is None or supports(evidence, *n) else "assumed"


def build(ds, rng):
    ev, reqs, n = [], [], [0, 0]
    gt = ds.get("ground_truth", [])
    skip = {c: {g["entity_ref"].split(":", 1)[1] for g in gt if g["category"] == c} for c in ("BACKUP_RESTORE_UNTESTED", "VENDOR_ASSESSMENT_STALE")}
    skip_drill = any(g["category"] == "IR_DRILL_STALE" for g in gt)

    def add(etype, ref, content, date, require=False):
        n[0] += 1
        ev.append({"id": f"EVD-{n[0]:06d}", "type": etype, "source": EV_SOURCE[etype], "entity_ref": ref, "collected_at": date,
                   "content": content, "sha256": digest(content)})
        if require:
            n[1] += 1
            reqs.append({"req_id": f"REQ-{n[1]:05d}", "type": etype, "entity_ref": ref, "max_age_days": MAX_AGE[etype], "controls": [REQ_CONTROL[etype]]})

    for f in FEEDS:
        add(f, f"feed:{f}", {"records": len(ds["assets"]), "note": "synthetic export"}, d(rng.randint(1, 15)))
    for a in ds["assets"]:
        if a["criticality"] >= 3 and a["type"] not in ("endpoint", "vendor_service"):
            add("config_snapshot", f"asset:{a['id']}", {"config": a["config"]}, d(rng.randint(1, 70)), True)
        if a["software"] and a["criticality"] >= 3:
            add("vuln_scan", f"asset:{a['id']}", {"software": a["software"]}, d(rng.randint(1, 25)), True)
    for b in ds["backups"]:
        if b["asset_id"] not in skip["BACKUP_RESTORE_UNTESTED"]:
            add("restore_test", f"backup:{b['asset_id']}", {"result": "pass", "rto_met": True}, b["last_restore_test"], True)
    for v in ds["vendors"]:
        if v["criticality"] != "standard" and v["id"] not in skip["VENDOR_ASSESSMENT_STALE"]:
            add("vendor_assessment", f"vendor:{v['id']}", {"rating": "acceptable"}, v["last_assessment"], True)
    if not skip_drill: add("drill_report", "ir:drill", {"scenario": "ransomware tabletop"}, ds["ir_plan"]["last_drill_date"], True)
    for z in ("internet-banking", "mobile-banking", "payments"):
        add("pentest_report", f"zone:{z}", {"critical_open": 0}, d(rng.randint(30, 300)), True)
    ds["evidence"], ds["evidence_requirements"] = ev, reqs


class EvidenceStore:
    """Idempotent ingestion. 'verified' status = trusted system source + fresh + hash intact."""
    def __init__(self, as_of=AS_OF): self.as_of, self.items, self._seen, self.rejected = to_date(as_of), {}, set(), []
    def ingest(self, raw):
        miss = [k for k in REQUIRED_KEYS if k not in raw]
        if miss: return self._rej(raw, f"missing fields: {miss}")
        if raw["type"] not in MAX_AGE: return self._rej(raw, f"unknown evidence type '{raw['type']}'")
        try: age = age_days(raw["collected_at"], self.as_of)
        except Exception: return self._rej(raw, "invalid collected_at")
        if age < 0: return self._rej(raw, "collected_at is in the future")
        dg = digest(raw["content"])
        if raw.get("sha256") and raw["sha256"] != dg: return self._rej(raw, "hash mismatch (integrity check failed)")
        k = (raw["type"], raw["entity_ref"], dg, raw["collected_at"])
        if k in self._seen: return {"accepted": False, "reason": "duplicate"}
        self._seen.add(k)
        eid = raw.get("id") or f"EVD-U{len(self.items) + 1:05d}"
        trust = "system" if raw["source"] in TRUSTED_SOURCES else "attested"
        fresh = "fresh" if age <= MAX_AGE[raw["type"]] else "stale"
        item = {**raw, "id": eid, "sha256": dg, "integrity_ok": True, "trust": trust, "freshness": fresh,
                "status": "verified" if (trust == "system" and fresh == "fresh") else "unverified"}
        self.items[eid] = item
        return {"accepted": True, "id": eid, "status": item["status"], "trust": trust, "freshness": fresh}
    def _rej(self, raw, why): self.rejected.append({"id": raw.get("id"), "reason": why}); return {"accepted": False, "reason": why}
    def all(self): return list(self.items.values())
    def summary(self):
        s = {"total": len(self.items), "verified": 0, "unverified": 0, "stale": 0, "attested": 0, "rejected": len(self.rejected), "by_type": {}}
        for e in self.items.values():
            s[e["status"]] += 1; s["stale"] += e["freshness"] == "stale"; s["attested"] += e["trust"] == "attested"
            s["by_type"][e["type"]] = s["by_type"].get(e["type"], 0) + 1
        return s
