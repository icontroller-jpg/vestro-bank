from django.conf import settings
from django.utils import timezone
from vestro_core.generator import generate
from vestro_core.evidence import EvidenceStore
from vestro_core.rebel_ref import ReferenceRebel, HttpRebelClient
from vestro_core.assessment import run_assessment
from .models import AssessmentRun, AuditLog, Dataset, UploadedEvidence

_cache = {}

def audit(user, action, **detail): AuditLog.objects.create(user=getattr(user, "username", str(user)), action=action, detail=detail)

def active_dataset():
    return Dataset.objects.filter(active=True).order_by("-id").first()

def blob(ds):
    if ds.pk not in _cache: _cache.clear(); _cache[ds.pk] = ds.blob
    return _cache[ds.pk]

def create_dataset(seed, scale, user=None):
    data = generate(seed, scale)
    Dataset.objects.filter(active=True).update(active=False)
    ds = Dataset.objects.create(seed=seed, scale=scale, active=True, blob=data, created_by=user)
    audit(user, "dataset.generate", dataset=ds.pk, seed=seed, scale=scale, ground_truth=len(data["ground_truth"])); return ds

def build_store(ds):
    b = blob(ds); s = EvidenceStore(b["meta"]["as_of"])
    for e in b["evidence"]: s.ingest(e)
    for u in ds.uploadedevidence_set.all(): s.ingest(u.item)
    return s

def ingest_evidence(ds, items, user):
    b = blob(ds); s = build_store(ds); out = []
    for raw in items:
        r = s.ingest(raw); out.append(r)
        if r.get("accepted"): UploadedEvidence.objects.create(dataset=ds, item=raw, result=r, uploaded_by=user)
    audit(user, "evidence.ingest", dataset=ds.pk, submitted=len(items), accepted=sum(1 for r in out if r.get("accepted")))
    return out

def make_client(cfg):
    if cfg.get("client") == "http":
        if not settings.REBEL_BASE_URL: raise ValueError("REBEL_BASE_URL is not configured on the server")
        return HttpRebelClient(settings.REBEL_BASE_URL, settings.REBEL_TOKEN)
    f = lambda k, hi: min(max(float(cfg.get(k, 0)), 0.0), hi)
    return ReferenceRebel(f("miss_rate", 1), f("fp_rate", 1), f("overclaim_rate", 1), int(cfg.get("seed", 7)))

def execute_run(run_id):
    run = AssessmentRun.objects.select_related("dataset").get(pk=run_id); run.status = "running"; run.save(update_fields=["status"])
    try:
        run.result = run_assessment(blob(run.dataset), build_store(run.dataset), make_client(run.client_config), run.run_id); run.status = "done"
    except Exception as e:  # recorded, never leaks stack to API callers
        run.status, run.error = "failed", f"{type(e).__name__}: {e}"
    run.finished_at = timezone.now(); run.save()
    audit(run.created_by, "run.finished", run=run.run_id, status=run.status)
