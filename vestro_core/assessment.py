"""Step 1g: automated assessment workflow (ingest -> modules -> mapping -> prioritise -> report -> validate)."""
import datetime as dt
from .common import *
from .catalog import *
from .rebel_ref import MODULES
from .connectors import payload_for
from . import groundtruth, report as rep

ORDER = ["asset_inventory", "cbom", "pqc_readiness", "cyber_rating", "evidence_intelligence", "compliance_mapping"]
now = lambda: dt.datetime.now(dt.timezone.utc).isoformat()

def priority(f, A):
    a = A.get(f.get("asset_id")); crit = (a["criticality"] if a else 3) / 5
    exp = 1 + min(1.0, (a["daily_txn_value_inr"] if a else 0) / 5e7) * .5
    s = SEV_W[f["severity"]] * (.5 + crit) * exp * (.7 + .3 * f["confidence"])
    return round(s, 2), "P1" if s >= 12 else "P2" if s >= 7 else "P3" if s >= 4 else "P4"

def run_assessment(ds, store, client, run_id):
    steps, findings, summaries, maps = [], [], {}, {}
    def step(name, detail): steps.append({"step": name, "at": now(), "detail": detail})
    step("evidence_ingestion", store.summary())
    ev = store.all()
    for m in ORDER:
        out = client.call(m, payload_for(m, ds, ev, findings))
        for f in out["findings"]:
            f.setdefault("module", m); f.setdefault("status", "assumed"); f.setdefault("confidence", .5)
            f.setdefault("evidence_ids", []); f.setdefault("limitations", []); f.setdefault("generated_at", now())
        findings += out["findings"]; summaries[m] = out.get("summary", {}); maps.update(out.get("mappings", {}))
        step(m, {"findings": len(out["findings"]), "summary": summaries[m]})
    A = {a["id"]: a for a in ds["assets"]}; E = {e["id"]: e for e in ev}; uniq = {}
    for f in findings: uniq.setdefault((f["category"], f["entity_ref"]), f)
    findings = list(uniq.values())
    for i, f in enumerate(findings, 1):
        f["finding_id"] = f"{run_id}-F{i:04d}"
        ctl = maps.get(key(f["category"], f["entity_ref"])) or []
        if not ctl: f["limitations"].append("No control mapping returned by compliance mapping module.")
        f["controls"] = [{"control_id": c, "title": CONTROLS[c][0], "references": [{"framework": FRAMEWORKS[r], "clause": None} for r in CONTROLS[c][1]]} for c in ctl if c in CONTROLS]
        f["priority_score"], f["priority"] = priority(f, A)
        f["remediation"] = SCEN.get(f["category"], {}).get("fix", "Review and remediate.")
        f["evidence"] = [{"id": i_, "type": E[i_]["type"], "source": E[i_]["source"], "collected_at": E[i_]["collected_at"], "sha256": E[i_]["sha256"]} for i_ in f["evidence_ids"] if i_ in E]
        f["limitations"].append("Synthetic environment: simulated finding, not a regulatory determination.")
    findings.sort(key=lambda f: -f["priority_score"])
    run = {"run_id": run_id, "client": client.name, "started_at": steps[0]["at"], "finished_at": now(), "steps": steps,
           "module_summaries": summaries, "findings": findings, "validation": groundtruth.evaluate(findings, ds["ground_truth"], ds["decoys"])}
    run["report"] = rep.build_report(run, ds)
    return run
