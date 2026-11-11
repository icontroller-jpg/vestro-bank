from django.conf import settings
from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from vestro_core.catalog import SCEN, CONTROLS, FRAMEWORKS
from vestro_core.connectors import payload_for
from vestro_core.rebel_ref import MODULES
from vestro_core.report import to_markdown
from vestro_core.common import DISCLAIMER
from .models import AssessmentRun, AuditLog
from .permissions import needs, perms_for, has_perm
from . import services as S

def _ds():
    ds = S.active_dataset()
    if not ds: raise_404("No active dataset. An admin must generate one.")
    return ds
def raise_404(msg):
    from rest_framework.exceptions import NotFound; raise NotFound(msg)

class Health(APIView):
    permission_classes = [AllowAny]
    def get(self, r): return Response({"status": "ok", "synthetic": True})

class Me(APIView):
    def get(self, r): return Response({"username": r.user.username, "roles": list(r.user.groups.values_list("name", flat=True)), "permissions": sorted(perms_for(r.user)), "disclaimer": DISCLAIMER})

class DatasetView(APIView):
    def get_permissions(self): return [needs("admin:dataset")()] if self.request.method == "POST" else [needs("read:summary")()]
    def get(self, r):
        ds = _ds(); b = S.blob(ds)
        return Response({"id": ds.pk, "meta": b["meta"], "counts": b["counts"], "disclaimer": DISCLAIMER,
                         "scenario_catalog": [{"category": k, "title": v["title"], "module": v["module"], "severity": v["severity"], "controls": v["controls"]} for k, v in SCEN.items()],
                         "controls": {k: {"title": v[0], "frameworks": [FRAMEWORKS[x] for x in v[1]]} for k, v in CONTROLS.items()}, "modules": MODULES})
    def post(self, r):
        seed, scale = int(r.data.get("seed", 42)), float(r.data.get("scale", 1.0))
        if not (0.1 <= scale <= 4): return Response({"detail": "scale must be 0.1-4"}, 400)
        ds = S.create_dataset(seed, scale, r.user); return Response({"id": ds.pk, "counts": S.blob(ds)["counts"]}, 201)

class Source(APIView):
    permission_classes = [needs("read:source")]
    def get(self, r, module):
        if module not in MODULES: raise_404("unknown module")
        ds = _ds(); S.audit(r.user, "source.pull", module=module)
        return Response(payload_for(module, S.blob(ds), S.build_store(ds).all()))

class EvidenceView(APIView):
    def get_permissions(self): return [needs("write:evidence")()] if self.request.method == "POST" else [needs("read:summary")()]
    def get(self, r): return Response(S.build_store(_ds()).summary())
    def post(self, r):
        items = r.data if isinstance(r.data, list) else [r.data]
        if len(items) > 500: return Response({"detail": "max 500 items per request"}, 413)
        return Response({"results": S.ingest_evidence(_ds(), items, r.user)}, 201)

def _run_summary(run, user):
    out = {"id": run.run_id, "pk": run.pk, "status": run.status, "client": run.client_config, "created_at": run.created_at, "finished_at": run.finished_at, "error": run.error}
    if run.result:
        out["summary"] = run.result["report"]["summary"]; out["module_summaries"] = run.result["module_summaries"]
        if has_perm(user, "read:metrics"): out["validation"] = run.result["validation"]["summary"]
    return out

class Runs(APIView):
    def get_permissions(self): return [needs("run:assessment")()] if self.request.method == "POST" else [needs("read:summary")()]
    def get(self, r): return Response([_run_summary(x, r.user) for x in AssessmentRun.objects.filter(dataset=_ds()).order_by("-id")[:50]])
    def post(self, r):
        cfg = {k: r.data[k] for k in ("client", "miss_rate", "fp_rate", "overclaim_rate", "seed") if k in r.data}
        run = AssessmentRun.objects.create(dataset=_ds(), client_config=cfg, created_by=r.user); S.audit(r.user, "run.start", run=run.run_id, client=cfg)
        if settings.CELERY_ENABLED:
            from .tasks import run_assessment_task; run_assessment_task.delay(run.pk)
        else: S.execute_run(run.pk)
        run.refresh_from_db(); return Response(_run_summary(run, r.user), 202 if run.status == "queued" else 201)

def _run(pk):
    try: return AssessmentRun.objects.get(pk=pk)
    except AssessmentRun.DoesNotExist: raise_404("run not found")

class RunDetail(APIView):
    permission_classes = [needs("read:summary")]
    def get(self, r, pk): return Response(_run_summary(_run(pk), r.user))

class Findings(APIView):
    permission_classes = [needs("read:findings")]
    def get(self, r, pk):
        run = _run(pk); F = (run.result or {}).get("findings", [])
        for k in ("severity", "status", "category", "priority", "module"):
            if r.query_params.get(k): F = [f for f in F if f.get(k) == r.query_params[k]]
        lim = min(int(r.query_params.get("limit", 200)), 1000); off = int(r.query_params.get("offset", 0))
        return Response({"total": len(F), "results": F[off:off + lim], "disclaimer": DISCLAIMER})

class Report(APIView):
    permission_classes = [needs("read:reports")]
    def get(self, r, pk):
        run = _run(pk)
        if not run.result: return Response({"detail": f"run is {run.status}"}, 409)
        S.audit(r.user, "report.read", run=run.run_id)
        if r.query_params.get("format") == "md": return HttpResponse(to_markdown(run.result["report"]), content_type="text/markdown")
        return Response(run.result["report"])

class Validation(APIView):
    permission_classes = [needs("read:metrics")]
    def get(self, r, pk):
        run = _run(pk)
        if not run.result: return Response({"detail": f"run is {run.status}"}, 409)
        return Response({**run.result["validation"], "disclaimer": DISCLAIMER})

class GroundTruth(APIView):
    permission_classes = [needs("read:groundtruth")]
    def get(self, r):
        b = S.blob(_ds()); S.audit(r.user, "groundtruth.read")
        return Response({"defects": b["ground_truth"], "decoys": b["decoys"]})

class Audit(APIView):
    permission_classes = [needs("admin:audit")]
    def get(self, r): return Response(list(AuditLog.objects.values("id", "user", "action", "detail", "created_at")[:200]))
