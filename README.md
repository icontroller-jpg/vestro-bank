# Vestro - synthetic Indian banking environment for validating Rebel

All data is **synthetic**. Architecture follows publicly documented banking practice and the *public titles* of RBI directions;
it does not replicate any bank's confidential infrastructure. Findings are **simulated**, never regulatory determinations.

```
vestro_core/   framework-free domain: generator, scenarios (ground truth), evidence pipeline, Rebel clients, ground-truth engine, workflow, report
backend/       Django + DRF + SimpleJWT + Celery  (RBAC, audit log, async runs, source API for Rebel)
frontend/      React (Vite) dashboard, role-aware tabs
docker-compose Postgres, Redis, gunicorn, Celery worker, nginx
```

## Run locally (no Docker)
```bash
pip install -r backend/requirements.txt
cd backend && export DJANGO_DEBUG=1
python manage.py migrate && python manage.py seed_demo      # prints demo password once; users demo_admin/assessor/auditor/viewer/connector
python manage.py runserver                                  # API on :8000
cd ../frontend && npm install && npm run dev                # UI on :5173 (proxies /api)
```
Docker: `cp .env.example .env` (edit) -> `docker compose up --build` -> `docker compose exec backend python manage.py seed_demo` -> http://localhost:8080
(compose file not exercised in the authoring sandbox - verify on first run).

Tests: `pytest tests/` (core) and `cd backend && DJANGO_DEBUG=1 python manage.py test lab` (API/RBAC).

## What is simulated (default scale 1.0: 2,500 assets, 1,200 identities, 20,000 txns, 6,000 events, 2,500+ crypto components, 40 vendors, ~2,700 evidence items)
Core banking, internet/mobile banking, payments (UPI/IMPS/NEFT/RTGS/card), ATM switch, DR site, cloud workloads, PAM/identities, vendors,
CBOM, backups/DR, policies, IR plan, SIEM-style events. Baseline is compliant by construction; **26 defect categories (~190 defects)** are injected
and recorded as ground truth, plus **near-miss decoys** (e.g. patch exactly at fixed version, review 178 days ago) that punish over-flagging.
Vulnerability IDs are fictional (`VSYN-*`).

## Ground-truth engine
Match key = (category, entity). Reports precision, recall, F1, FP, FN, per-category and per-severity recall, severity accuracy,
**status accuracy** (did Rebel correctly say *verified* vs *assumed*), over-claimed "verified", decoy hits, and the list of missed defects.
A finding is `verified` only with fresh evidence from a trusted system source and an intact SHA-256; otherwise `assumed`.

## RBAC
| role | can |
|---|---|
| viewer | summary |
| assessor | + findings, reports, run assessments, upload evidence (**cannot** see ground truth) |
| auditor | summary, findings, reports, validation metrics, ground truth |
| connector | machine identity for Rebel: pull `/source/<module>`, push evidence |
| admin | everything incl. dataset generation and audit log |

## Connecting the real Rebel
Set `REBEL_BASE_URL` / `REBEL_TOKEN` on the server and run an assessment with client **Real Rebel**. For each module Vestro POSTs the payload from
`vestro_core/connectors.py` (also served at `GET /api/v1/source/<module>`) and expects
`{"findings":[{category, entity_ref, severity, status, confidence, evidence_ids, ...}], "summary":{}, "mappings":{"CATEGORY|entity_ref":["VC-..."]}}`.
**Route paths in `DEFAULT_PATHS` are placeholders** - align them (and the finding schema) with Rebel's actual API. The built-in `ReferenceRebel`
is only a stand-in that exercises the harness; it is not Rebel.

## Honest limits / next steps
- Control->regulation mapping names public documents only; **clause numbers are blank** pending verification by a compliance SME.
- Reference CyberRating/PQC scores are simple heuristics, not Rebel's.
- Not yet included: OIDC/SSO + enforced MFA, secrets manager/KMS, object storage with WORM retention for evidence, streaming (Kafka) event ingest,
  OpenTelemetry, rate limits per role, DB row-level encryption. For authorised bank pilots: read-only connectors, data diode/export-only intake,
  tenant isolation, and a DPIA/risk sign-off before any non-synthetic data.
# vestro-bank
