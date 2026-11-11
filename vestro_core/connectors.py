"""Step 1e: the payload contract between Vestro and Rebel (also served by the Django 'source' API)."""
from .catalog import REQUIRED_PLAYBOOKS

def payload_for(module, ds, evidence, findings=None):
    base = {"as_of": ds["meta"]["as_of"], "synthetic": True, "evidence": evidence, "vuln_db": ds["vuln_db"]}
    parts = {"asset_inventory": {"assets": ds["assets"], "discovered_hosts": ds["discovered_hosts"]},
             "cbom": {"crypto": ds["crypto"]}, "pqc_readiness": {"crypto": ds["crypto"]},
             "cyber_rating": {"assets": ds["assets"], "identities": ds["employees"], "backups": ds["backups"]},
             "evidence_intelligence": {"evidence_requirements": ds["evidence_requirements"]},
             "compliance_mapping": {"policies": ds["policies"], "ir_plan": ds["ir_plan"], "required_playbooks": REQUIRED_PLAYBOOKS,
                                    "events": ds["events"], "vendors": ds["vendors"], "crypto": ds["crypto"], "assets": ds["assets"], "findings": findings or []}}
    return {**base, **parts[module]}
