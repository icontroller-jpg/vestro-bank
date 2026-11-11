"""Step 1f: ground-truth engine. Match key = (category, entity_ref)."""
from .common import SEV_ORDER

def _r(a, b): return round(a / b, 4) if b else 1.0

def evaluate(findings, gt, decoys):
    gmap = {(g["category"], g["entity_ref"]): g for g in gt}; dmap = {(x["category"], x["entity_ref"]): x for x in decoys}
    seen, tp, fp, dup, decoy_hits = {}, [], [], 0, []
    for f in findings:
        k = (f["category"], f["entity_ref"])
        if k in seen: dup += 1; continue
        seen[k] = f
        if k in gmap: tp.append((gmap[k], f))
        else:
            fp.append(f)
            if k in dmap: decoy_hits.append({**f, "decoy_note": dmap[k]["note"]})
    hit = {(g["category"], g["entity_ref"]) for g, _ in tp}
    fn = [g for g in gt if (g["category"], g["entity_ref"]) not in hit]
    P, R = _r(len(tp), len(tp) + len(fp)), _r(len(tp), len(gt)); F1 = round(2 * P * R / (P + R), 4) if P + R else 0.0
    cats = {}
    for c in sorted({g["category"] for g in gt} | {f["category"] for f in fp}):
        t = sum(1 for g, _ in tp if g["category"] == c); f_ = sum(1 for f in fp if f["category"] == c); n = sum(1 for g in gt if g["category"] == c)
        cats[c] = {"expected": n, "tp": t, "fp": f_, "fn": n - t, "precision": _r(t, t + f_), "recall": _r(t, n)}
    sev = {s: {"expected": sum(1 for g in gt if g["severity"] == s), "found": sum(1 for g, _ in tp if g["severity"] == s)} for s in SEV_ORDER}
    for v in sev.values(): v["recall"] = _r(v["found"], v["expected"])
    agree = sum(1 for g, f in tp if f.get("status") == g["expected_status"])
    over = sum(1 for g, f in tp if f.get("status") == "verified" and g["expected_status"] == "assumed")
    return {"summary": {"expected": len(gt), "reported": len(seen), "tp": len(tp), "fp": len(fp), "fn": len(fn), "duplicates": dup,
                        "precision": P, "recall": R, "f1": F1, "decoy_hits": len(decoy_hits),
                        "severity_accuracy": _r(sum(1 for g, f in tp if f["severity"] == g["severity"]), len(tp)),
                        "status_accuracy": _r(agree, len(tp)), "overclaimed_verified": over,
                        "hard_cases_found": f"{sum(1 for g, _ in tp if g['hard'])}/{sum(1 for g in gt if g['hard'])}"},
            "by_category": cats, "by_severity": sev,
            "missed": [{k: g[k] for k in ("gt_id", "category", "entity_ref", "severity", "description", "expected_status")} for g in fn],
            "false_positives": [{k: f.get(k) for k in ("category", "entity_ref", "severity", "module", "description")} for f in fp],
            "decoy_hits": decoy_hits}
