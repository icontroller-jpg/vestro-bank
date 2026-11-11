"""Step 1h: traceable audit report (JSON + Markdown). Ground-truth validation is kept out of the report body."""
from .common import *
from .catalog import *

def coverage(findings):
    by = {}
    for f in findings:
        for c in f["controls"]: by.setdefault(c["control_id"], []).append(f)
    out = {}
    for fw, name in FRAMEWORKS.items():
        rows = [{"control_id": cid, "title": t, "open_findings": len(by.get(cid, [])), "verified": sum(1 for f in by.get(cid, []) if f["status"] == "verified"),
                 "assumed": sum(1 for f in by.get(cid, []) if f["status"] == "assumed")} for cid, (t, refs) in CONTROLS.items() if fw in refs]
        out[fw] = {"document": name, "clause_mapping": "pending SME verification", "controls": rows}
    return out

def build_report(run, ds):
    F = run["findings"]; cnt = lambda k: {v: sum(1 for f in F if f[k] == v) for v in sorted({f[k] for f in F})}
    return {"title": "Vestro simulated assessment report", "disclaimer": DISCLAIMER, "run_id": run["run_id"], "assessed_client": run["client"],
            "as_of": ds["meta"]["as_of"], "generated_at": run["finished_at"],
            "scope": ds["counts"], "method": [{"step": s["step"], "at": s["at"]} for s in run["steps"]],
            "summary": {"findings": len(F), "by_severity": cnt("severity"), "by_status": cnt("status"), "by_priority": cnt("priority"), "module_summaries": run["module_summaries"]},
            "findings": F, "compliance_coverage": coverage(F),
            "limitations": ["All data is synthetic; no production systems were accessed.",
                            "'assumed' findings rely on inventory attributes without current system-sourced evidence.",
                            "Control-to-regulation mapping is illustrative; clause references must be verified by a compliance SME.",
                            "Scores/ratings from the stand-in client are heuristics, not Rebel's proprietary outputs."]}

def to_markdown(r):
    L = [f"# {r['title']} - {r['run_id']}", f"> {r['disclaimer']}", "", f"Client assessed: `{r['assessed_client']}` | As of {r['as_of']} | Generated {r['generated_at']}", "",
         "## Summary", f"- Findings: **{r['summary']['findings']}**", f"- By severity: {r['summary']['by_severity']}", f"- Verified vs assumed: {r['summary']['by_status']}",
         f"- Remediation priority: {r['summary']['by_priority']}", "", "## Top findings by remediation priority", "",
         "| Pri | Sev | Status | Conf | Category | Entity | Evidence |", "|---|---|---|---|---|---|---|"]
    for f in r["findings"][:40]:
        ev = ", ".join(f"{e['id']} ({e['source']}, {e['collected_at']})" for e in f["evidence"]) or "none - assumption"
        L.append(f"| {f['priority']} | {f['severity']} | {f['status']} | {f['confidence']} | {f['category']} | {f['entity_ref']} | {ev} |")
    L += ["", "## Limitations"] + [f"- {x}" for x in r["limitations"]]
    return "\n".join(L)
