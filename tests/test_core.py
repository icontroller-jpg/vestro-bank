import pytest
from vestro_core.generator import generate
from vestro_core.evidence import EvidenceStore
from vestro_core.rebel_ref import ReferenceRebel
from vestro_core.assessment import run_assessment
from vestro_core.common import digest, DISCLAIMER

@pytest.fixture(scope="module")
def ds(): return generate(seed=42, scale=0.3)

def store_for(ds):
    s = EvidenceStore(ds["meta"]["as_of"]); [s.ingest(e) for e in ds["evidence"]]; return s

def test_reproducible():
    a, b = generate(7, 0.15), generate(7, 0.15)
    assert a["ground_truth"] == b["ground_truth"] and a["assets"][5] == b["assets"][5]
    assert generate(8, 0.15)["ground_truth"] != a["ground_truth"]

def test_scale_and_relationships(ds):
    assert ds["counts"]["assets"] >= 700 and ds["counts"]["transactions"] >= 6000
    ids = {a["id"] for a in ds["assets"]}
    assert all(x["asset_id"] in ids for x in ds["crypto"]) and all(b["asset_id"] in ids for b in ds["backups"])
    assert all(t["switch_asset_id"] in ids for t in ds["transactions"])
    assert len({g["gt_id"] for g in ds["ground_truth"]}) == len(ds["ground_truth"]) >= 50
    assert len({(g["category"], g["entity_ref"]) for g in ds["ground_truth"]}) == len(ds["ground_truth"])

def test_perfect_client_is_perfect(ds):
    run = run_assessment(ds, store_for(ds), ReferenceRebel(), "RUN-T")
    s = run["validation"]["summary"]
    assert s["fp"] == 0 and s["fn"] == 0 and s["precision"] == s["recall"] == 1.0, (run["validation"]["missed"][:3], run["validation"]["false_positives"][:3])
    assert s["status_accuracy"] == 1.0 and s["decoy_hits"] == 0 and s["overclaimed_verified"] == 0

def test_noisy_client_is_measured(ds):
    s = run_assessment(ds, store_for(ds), ReferenceRebel(miss_rate=.3, fp_rate=.2, overclaim_rate=1, seed=1), "RUN-N")["validation"]
    assert s["summary"]["recall"] < .85 and s["summary"]["precision"] < 1 and s["summary"]["fn"] > 0 and s["summary"]["fp"] > 0
    assert s["missed"] and s["false_positives"]

def test_report_traceability(ds):
    r = run_assessment(ds, store_for(ds), ReferenceRebel(), "RUN-R")["report"]
    assert r["disclaimer"] == DISCLAIMER and "validation" not in r
    v = [f for f in r["findings"] if f["status"] == "verified" and not f["category"].startswith("EVIDENCE_")]
    assert v and all(f["evidence"] and f["evidence"][0]["sha256"] and f["controls"] for f in v)
    a = [f for f in r["findings"] if f["status"] == "assumed"]
    assert a and all(not f["evidence"] and any("assumption" in l for l in f["limitations"]) for f in a)

def test_ingestion_pipeline():
    s = EvidenceStore("2026-10-27"); c = {"k": 1}
    base = {"type": "config_snapshot", "source": "config-scanner", "entity_ref": "asset:X", "collected_at": "2026-10-01", "content": c}
    assert s.ingest(base)["status"] == "verified"
    assert s.ingest(base)["reason"] == "duplicate"
    assert s.ingest({**base, "sha256": "bad", "collected_at": "2026-10-02"})["reason"].startswith("hash mismatch")
    assert s.ingest({**base, "source": "email-attachment", "collected_at": "2026-10-03"})["trust"] == "attested"
    assert s.ingest({**base, "collected_at": "2025-01-01", "content": {"k": 2}})["freshness"] == "stale"
    assert not s.ingest({"type": "x"})["accepted"] and not s.ingest({**base, "type": "nope"})["accepted"]
    assert s.summary()["attested"] == 1 and s.summary()["rejected"] == 3
