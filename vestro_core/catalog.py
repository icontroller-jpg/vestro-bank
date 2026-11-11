"""Synthetic software/vulnerability DB, control catalogue and scenario catalogue.
Vulnerability IDs are fictional (VSYN-*). Regulatory references name public documents only; clause numbers are
intentionally left empty for a compliance SME to fill in and verify against the current RBI text."""

SOFT = {
    "synth-httpd":    dict(current="2.6.1",  fixed="2.4.9", vuln_id="VSYN-2026-0001", cvss=9.1),
    "synth-db":       dict(current="14.8",   fixed="14.5",  vuln_id="VSYN-2026-0002", cvss=8.8),
    "synth-appsrv":   dict(current="9.0.4",  fixed="9.0.2", vuln_id="VSYN-2026-0003", cvss=9.8),
    "synth-ssl":      dict(current="3.2.0",  fixed="3.0.8", vuln_id="VSYN-2026-0004", cvss=7.5),
    "synth-queue":    dict(current="5.1.2",  fixed="5.0.9", vuln_id="VSYN-2026-0005", cvss=8.1),
    "synth-os-linux": dict(current="8.9",    fixed="8.6",   vuln_id="VSYN-2026-0006", cvss=6.8),
}
SW_BY_TYPE = {"server": ["synth-os-linux", "synth-ssl"], "database": ["synth-db", "synth-os-linux"],
              "application": ["synth-appsrv", "synth-httpd", "synth-ssl"], "cloud_instance": ["synth-os-linux", "synth-queue"],
              "endpoint": ["synth-os-linux"]}

TYPE_W = [("server", 28), ("database", 7), ("application", 13), ("network", 8), ("endpoint", 20), ("cloud_instance", 10),
          ("storage_bucket", 5), ("vendor_service", 4), ("hsm", 1), ("firewall", 4)]
ZONE_W = [("core-banking", 12), ("internet-banking", 10), ("mobile-banking", 8), ("payments", 12), ("atm-switch", 6),
          ("corporate-it", 30), ("cloud-workloads", 12), ("dr-site", 6), ("security-tooling", 4)]
ZONE_CRIT = {"core-banking": 5, "payments": 5, "internet-banking": 4, "mobile-banking": 4, "atm-switch": 4,
             "cloud-workloads": 3, "dr-site": 4, "security-tooling": 3, "corporate-it": 2}
ZONE_DEPT = {"core-banking": "IT-Infra", "internet-banking": "Digital Channels", "mobile-banking": "Digital Channels",
             "payments": "Payments Ops", "atm-switch": "Operations", "corporate-it": "IT-Infra", "cloud-workloads": "IT-Infra",
             "dr-site": "IT-Infra", "security-tooling": "Security"}
DEPT_W = [("IT-Infra", 5), ("DBA", 2), ("Security", 3), ("Retail Banking", 25), ("Treasury", 5), ("Operations", 20),
          ("Compliance", 4), ("Audit", 3), ("HR", 3), ("Finance", 5), ("Digital Channels", 8), ("Payments Ops", 7)]
PRIV_DEPTS = {"IT-Infra", "DBA", "Security"}
DEPT_ZONES = {"IT-Infra": ["core-banking", "corporate-it", "cloud-workloads", "dr-site", "payments"],
              "DBA": ["core-banking", "payments", "internet-banking", "mobile-banking"],
              "Security": ["security-tooling", "corporate-it", "internet-banking"],
              "Retail Banking": ["core-banking", "corporate-it"], "Operations": ["core-banking", "atm-switch", "corporate-it"],
              "Payments Ops": ["payments", "corporate-it"], "Digital Channels": ["internet-banking", "mobile-banking"]}
REQUIRED_PLAYBOOKS = ["ransomware", "ddos", "data_breach", "payment_fraud", "insider_threat", "third_party_breach"]
POLICY_TITLES = ["Information Security Policy", "Cyber Crisis Management Plan", "Access Control Policy",
                 "Cryptography & Key Management Policy", "Outsourcing & Third-Party Risk Policy", "BCP/DR Policy",
                 "Change Management Policy", "Patch & Vulnerability Management Policy", "Data Classification Policy",
                 "Logging & Monitoring Policy", "Incident Response Policy", "Cloud Security Policy",
                 "Backup & Restore Policy", "Digital Payment Security Policy"]

FRAMEWORKS = {
    "RBI-ITGRCA": "RBI Master Direction on IT Governance, Risk, Controls and Assurance Practices (2023)",
    "RBI-CSF": "RBI Cyber Security Framework in Banks (2016)",
    "RBI-OUTSRC": "RBI Master Direction on Outsourcing of Information Technology Services (2023)",
    "RBI-DPSC": "RBI Master Direction on Digital Payment Security Controls (2021)",
    "NIST-PQC": "NIST FIPS 203 / 204 / 205 (post-quantum cryptography standards)",
    "RBI-PSD": "RBI directive on Storage of Payment System Data (2018)",
    "CERT-IN": "CERT-In Directions on cyber incident reporting and log retention (IT Act s.70B, 2022)",
    "DPDP": "Digital Personal Data Protection Act (2023)",
    "PCI-DSS": "PCI DSS (payment card industry data security standard)",
    "ISO27001": "ISO/IEC 27001 information security management",
}
CONTROLS = {
    "VC-IAM-01": ("Least-privilege privileged access", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-IAM-02": ("No shared/generic privileged accounts", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-IAM-03": ("Timely deprovisioning of leavers", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-IAM-04": ("MFA for privileged access", ["RBI-ITGRCA", "RBI-CSF", "RBI-DPSC"]),
    "VC-IAM-05": ("Periodic access recertification", ["RBI-ITGRCA"]),
    "VC-VUL-01": ("Vulnerability and patch management", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-CFG-01": ("Secure configuration baseline", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-CFG-02": ("Encryption of data at rest", ["RBI-ITGRCA", "RBI-DPSC", "DPDP"]),
    "VC-LOG-01": ("Logging and security monitoring", ["RBI-ITGRCA", "RBI-CSF", "CERT-IN"]),
    "VC-CRY-01": ("Approved cryptographic algorithms/protocols", ["RBI-ITGRCA", "RBI-DPSC", "PCI-DSS"]),
    "VC-CRY-02": ("Certificate lifecycle management", ["RBI-ITGRCA"]),
    "VC-CRY-03": ("Quantum-safe migration planning", ["NIST-PQC", "RBI-ITGRCA"]),
    "VC-GOV-01": ("Policy review cycle", ["RBI-ITGRCA", "ISO27001"]),
    "VC-IR-01": ("Incident response playbooks", ["RBI-CSF", "RBI-ITGRCA"]),
    "VC-IR-02": ("Incident response exercises", ["RBI-CSF"]),
    "VC-IR-03": ("Incident containment timelines", ["RBI-CSF", "RBI-ITGRCA", "CERT-IN"]),
    "VC-BCP-01": ("Backup restoration testing", ["RBI-ITGRCA"]),
    "VC-BCP-02": ("Immutable/offline backup copies", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-BCP-03": ("DR replication for critical systems", ["RBI-ITGRCA"]),
    "VC-TPR-01": ("Audit and access rights in vendor contracts", ["RBI-OUTSRC"]),
    "VC-TPR-02": ("Periodic third-party risk assessment", ["RBI-OUTSRC"]),
    "VC-AST-01": ("Complete and accurate asset inventory", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-EVD-01": ("Control evidence is available", ["RBI-ITGRCA"]),
    "VC-EVD-02": ("Control evidence is current", ["RBI-ITGRCA"]),
    "VC-IAM-06": ("Disablement of dormant accounts", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-IAM-07": ("Segregation of duties / maker-checker", ["RBI-ITGRCA", "RBI-CSF", "PCI-DSS"]),
    "VC-VUL-02": ("No unsupported / end-of-life platforms in production", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-BCP-04": ("Annual DC-to-DR failover drill", ["RBI-ITGRCA", "RBI-CSF"]),
    "VC-TPR-03": ("Controlled vendor remote access (PAM, session recording)", ["RBI-OUTSRC", "RBI-CSF"]),
    "VC-TPR-04": ("Payment and customer data stored in India", ["RBI-PSD", "RBI-OUTSRC", "DPDP"]),
}

def S(module, sev, controls, ev, title, fix, count):
    return dict(module=module, severity=sev, controls=controls, evidence=ev, title=title, fix=fix, count=count)

# category -> definition. 'evidence' = (evidence type, scope) needed for a finding to be 'verified'
SCEN = {
 "PRIV_EXCESSIVE_ADMIN":   S("cyber_rating", "high", ["VC-IAM-01"], ("iam_export", "feed"), "Privileged role outside privileged functions", "Remove or formally justify the entitlement; require ticketed approval and recertification.", 12),
 "PRIV_SHARED_ACCOUNT":    S("cyber_rating", "high", ["VC-IAM-02"], ("iam_export", "feed"), "Shared account with privileged role", "Replace with named, PAM-managed accounts with session recording.", 3),
 "PRIV_TERMINATED_ACTIVE": S("cyber_rating", "critical", ["VC-IAM-03"], ("iam_export", "feed"), "Leaver account still enabled", "Disable account and revoke entitlements; review activity since exit date.", 5),
 "PRIV_NO_MFA_ADMIN":      S("cyber_rating", "high", ["VC-IAM-04"], ("iam_export", "feed"), "Privileged user without MFA", "Enforce MFA for all privileged access paths.", 6),
 "PRIV_STALE_REVIEW":      S("cyber_rating", "medium", ["VC-IAM-05"], ("iam_export", "feed"), "Privileged access not recertified in 180 days", "Complete access recertification and enforce a 180-day cycle.", 8),
 "VULN_SOFTWARE":          S("cyber_rating", "high", ["VC-VUL-01"], ("vuln_scan", "asset"), "Software below fixed version", "Patch to the fixed version or apply documented compensating controls.", 40),
 "MISCONFIG_PUBLIC_STORAGE": S("cyber_rating", "critical", ["VC-CFG-01"], ("config_snapshot", "asset"), "Non-public data store exposed publicly", "Disable public access; review access logs for exposure.", 4),
 "MISCONFIG_NO_ENCRYPTION": S("cyber_rating", "high", ["VC-CFG-02"], ("config_snapshot", "asset"), "Data at rest not encrypted", "Enable encryption at rest with managed keys.", 8),
 "MISCONFIG_DEFAULT_CREDS": S("cyber_rating", "critical", ["VC-CFG-01", "VC-IAM-01"], ("config_snapshot", "asset"), "Default credentials in use", "Rotate credentials and vault them.", 5),
 "MISCONFIG_LOGGING_OFF":  S("cyber_rating", "medium", ["VC-LOG-01"], ("config_snapshot", "asset"), "Logging disabled on critical asset", "Enable logging and forward to SIEM.", 8),
 "CRYPTO_WEAK_ALGO":       S("cbom", "high", ["VC-CRY-01"], ("crypto_scan", "feed"), "Weak algorithm/protocol in use", "Migrate to approved algorithms/protocol versions.", 12),
 "CRYPTO_CERT_EXPIRED":    S("cbom", "high", ["VC-CRY-02"], ("crypto_scan", "feed"), "Expired certificate", "Renew and automate certificate lifecycle.", 6),
 "CRYPTO_PQC_NO_PLAN":     S("pqc_readiness", "medium", ["VC-CRY-03"], ("crypto_scan", "feed"), "Long-lived data protected by quantum-vulnerable crypto with no migration plan", "Register a PQC migration plan; adopt hybrid schemes and crypto-agility.", 10),
 "POLICY_OUTDATED":        S("compliance_mapping", "medium", ["VC-GOV-01"], ("policy_register", "feed"), "Policy not reviewed within 12 months", "Review, re-approve and publish the policy.", 4),
 "IR_PLAYBOOK_MISSING":    S("compliance_mapping", "high", ["VC-IR-01"], ("ir_register", "feed"), "Required incident playbook missing", "Author, approve and exercise the playbook.", 2),
 "IR_DRILL_STALE":         S("compliance_mapping", "medium", ["VC-IR-02"], ("ir_register", "feed"), "No incident exercise in 12 months", "Run and document a cyber-crisis exercise.", 1),
 "IR_SLOW_CONTAINMENT":    S("compliance_mapping", "high", ["VC-IR-03"], ("ir_register", "feed"), "High-severity incident exceeded containment target", "Root-cause the delay; revise escalation and automation.", 5),
 "BACKUP_RESTORE_UNTESTED": S("cyber_rating", "high", ["VC-BCP-01"], ("backup_export", "feed"), "Backup restore not tested in 12 months", "Perform and evidence a restore test.", 6),
 "BACKUP_NOT_IMMUTABLE":   S("cyber_rating", "high", ["VC-BCP-02"], ("backup_export", "feed"), "No immutable backup copy", "Add immutable/offline copy.", 5),
 "DR_NO_REPLICA":          S("cyber_rating", "high", ["VC-BCP-03"], ("backup_export", "feed"), "Critical system has no DR replica", "Provision DR replication and test failover.", 4),
 "VENDOR_NO_AUDIT_CLAUSE": S("compliance_mapping", "high", ["VC-TPR-01"], ("vendor_register", "feed"), "Critical vendor contract lacks audit rights", "Renegotiate contract to include audit and access rights.", 3),
 "VENDOR_ASSESSMENT_STALE": S("compliance_mapping", "medium", ["VC-TPR-02"], ("vendor_register", "feed"), "Vendor risk assessment older than 12 months", "Re-assess vendor and update risk register.", 4),
 "ASSET_UNMANAGED":        S("asset_inventory", "high", ["VC-AST-01"], ("network_discovery", "feed"), "Discovered host absent from inventory", "Identify owner; onboard or decommission.", 8),
 "EVIDENCE_MISSING":       S("evidence_intelligence", "medium", ["VC-EVD-01"], None, "Required control evidence not provided", "Collect and upload the evidence.", 10),
 "EVIDENCE_STALE":         S("evidence_intelligence", "low", ["VC-EVD-02"], None, "Control evidence older than its validity window", "Refresh the evidence.", 8),
 "PRIV_DORMANT_ACCOUNT":   S("cyber_rating", "medium", ["VC-IAM-06"], ("iam_export", "feed"), "Enabled account with no login for 90+ days", "Disable the account after owner confirmation; automate dormancy review.", 15),
 "PRIV_MAKER_CHECKER_SOD": S("cyber_rating", "high", ["VC-IAM-07"], ("iam_export", "feed"), "Same user holds maker and checker roles on one system", "Split the roles across users; enforce maker-checker in the application and recertify.", 10),
 "ASSET_EOL_SOFTWARE":     S("cyber_rating", "high", ["VC-VUL-02"], ("vuln_scan", "asset"), "End-of-life / unsupported platform in production", "Upgrade or replace; if impossible, isolate it and document compensating controls and an exit date.", 25),
 "DR_DRILL_STALE":         S("compliance_mapping", "high", ["VC-BCP-04"], ("ir_register", "feed"), "No DR failover drill in 12 months", "Run a full DC-to-DR failover drill and evidence RTO/RPO.", 1),
 "VENDOR_PRIVILEGED_REMOTE": S("compliance_mapping", "high", ["VC-TPR-03"], ("vendor_register", "feed"), "Vendor has privileged remote access outside PAM", "Route all vendor access through PAM/jump host with approval and session recording.", 4),
 "VENDOR_DATA_OFFSHORE":   S("compliance_mapping", "high", ["VC-TPR-04"], ("vendor_register", "feed"), "Vendor holding customer/payment data hosts it outside India", "Repatriate the data to India-hosted infrastructure or document regulatory approval.", 3),
}

MAX_AGE = {"config_snapshot": 90, "vuln_scan": 30, "restore_test": 365, "vendor_assessment": 365, "drill_report": 365,
           "pentest_report": 365, "iam_export": 30, "crypto_scan": 30, "policy_register": 30, "ir_register": 30,
           "vendor_register": 30, "backup_export": 30, "network_discovery": 30}
EV_SOURCE = {"config_snapshot": "config-scanner", "vuln_scan": "vuln-scanner", "restore_test": "backup-system",
             "vendor_assessment": "grc-register", "drill_report": "grc-register", "pentest_report": "grc-register",
             "iam_export": "iam-system", "crypto_scan": "crypto-inventory-scanner", "policy_register": "grc-register",
             "ir_register": "grc-register", "vendor_register": "grc-register", "backup_export": "backup-system",
             "network_discovery": "network-discovery"}
TRUSTED_SOURCES = set(EV_SOURCE.values())
FEEDS = ["iam_export", "crypto_scan", "policy_register", "ir_register", "vendor_register", "backup_export", "network_discovery"]
REQ_CONTROL = {"config_snapshot": "VC-CFG-01", "vuln_scan": "VC-VUL-01", "restore_test": "VC-BCP-01",
               "vendor_assessment": "VC-TPR-02", "drill_report": "VC-IR-02", "pentest_report": "VC-VUL-01"}