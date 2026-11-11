import os, secrets
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from lab.permissions import ensure_roles, ROLE_PERMS
from lab.services import create_dataset

class Command(BaseCommand):
    help = "Create roles, one demo user per role, and an active synthetic dataset."
    def add_arguments(self, p): p.add_argument("--seed", type=int, default=42); p.add_argument("--scale", type=float, default=1.0)
    def handle(self, *a, **o):
        ensure_roles(); pw = os.environ.get("VESTRO_DEMO_PASSWORD") or secrets.token_urlsafe(14); gen = "VESTRO_DEMO_PASSWORD" not in os.environ
        for role in ROLE_PERMS:
            u, _ = User.objects.get_or_create(username=f"demo_{role}"); u.set_password(pw); u.is_staff = role == "admin"; u.save(); u.groups.set([__import__("django.contrib.auth.models", fromlist=["Group"]).Group.objects.get(name=role)])
        ds = create_dataset(o["seed"], o["scale"], User.objects.get(username="demo_admin"))
        self.stdout.write(self.style.SUCCESS(f"Dataset {ds.pk}: {ds.blob['counts']}  ground-truth defects: {len(ds.blob['ground_truth'])}"))
        self.stdout.write(f"Users: " + ", ".join(f"demo_{r}" for r in ROLE_PERMS) + (f"\nGenerated password (shown once): {pw}" if gen else ""))
