from django.contrib.auth.models import Group, User
from django.test import override_settings
from rest_framework.test import APITestCase
from lab.permissions import ensure_roles, ROLE_PERMS
from lab.services import create_dataset

PW = "correct-horse-battery-9"

class ApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_roles()
        for r in ROLE_PERMS:
            u = User.objects.create_user(f"u_{r}", password=PW); u.groups.add(Group.objects.get(name=r))
        create_dataset(42, 0.15, User.objects.get(username="u_admin"))

    def login(self, role):
        t = self.client.post("/api/v1/auth/token", {"username": f"u_{role}", "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {t}")

    def run_perfect(self, role="assessor", **cfg):
        self.login(role); r = self.client.post("/api/v1/runs", {"client": "reference", **cfg}, format="json"); self.assertEqual(r.status_code, 201, r.data); return r.data

    def test_auth_required(self):
        self.assertEqual(self.client.get("/api/v1/dataset").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/health").status_code, 200)

    def test_rbac(self):
        self.login("viewer"); self.assertEqual(self.client.get("/api/v1/dataset").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/runs", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/groundtruth").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/source/cbom").status_code, 403)
        self.login("assessor"); self.assertEqual(self.client.get("/api/v1/groundtruth").status_code, 403)   # answer key hidden from assessors
        self.assertEqual(self.client.post("/api/v1/dataset", {}, format="json").status_code, 403)
        self.login("connector"); self.assertEqual(self.client.get("/api/v1/source/cbom").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/runs").status_code, 403)
        self.login("auditor"); self.assertEqual(self.client.get("/api/v1/groundtruth").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/audit-log").status_code, 403)
        self.login("admin"); self.assertEqual(self.client.get("/api/v1/audit-log").status_code, 200)

    def test_run_and_validation_visibility(self):
        run = self.run_perfect(); self.assertNotIn("validation", run); self.assertEqual(run["status"], "done")
        pk = run["pk"]; self.assertEqual(self.client.get(f"/api/v1/runs/{pk}/validation").status_code, 403)
        f = self.client.get(f"/api/v1/runs/{pk}/findings?severity=critical").data; self.assertTrue(all(x["severity"] == "critical" for x in f["results"]))
        md = self.client.get(f"/api/v1/runs/{pk}/report?format=md"); self.assertIn("SYNTHETIC", md.content.decode())
        self.login("auditor"); v = self.client.get(f"/api/v1/runs/{pk}/validation").data
        self.assertEqual((v["summary"]["precision"], v["summary"]["recall"]), (1.0, 1.0)); self.assertIn("disclaimer", v)

    def test_noisy_run_metrics(self):
        pk = self.run_perfect(miss_rate=0.4, fp_rate=0.3)["pk"]; self.login("auditor")
        s = self.client.get(f"/api/v1/runs/{pk}/validation").data["summary"]; self.assertLess(s["recall"], 1); self.assertGreater(s["fn"], 0)

    def test_evidence_upload_and_integrity(self):
        self.login("assessor"); ok = {"type": "config_snapshot", "source": "config-scanner", "entity_ref": "asset:ZZ", "collected_at": "2026-10-20", "content": {"a": 1}}
        r = self.client.post("/api/v1/evidence", [ok, {**ok, "sha256": "x", "collected_at": "2026-10-21"}, {"type": "bad"}], format="json").data["results"]
        self.assertTrue(r[0]["accepted"]); self.assertFalse(r[1]["accepted"]); self.assertFalse(r[2]["accepted"])

    @override_settings(REBEL_BASE_URL="")
    def test_http_client_cannot_be_redirected_by_caller(self):
        self.login("assessor"); r = self.client.post("/api/v1/runs", {"client": "http", "base_url": "http://169.254.169.254"}, format="json")
        self.assertEqual(r.data["status"], "failed"); self.assertIn("not configured", r.data["error"])

    def test_audit_trail(self):
        self.run_perfect(); self.login("admin"); acts = {a["action"] for a in self.client.get("/api/v1/audit-log").data}
        self.assertTrue({"dataset.generate", "run.start", "run.finished"} <= acts)
