from django.conf import settings
from django.db import models

class Dataset(models.Model):
    seed = models.IntegerField(); scale = models.FloatField(); active = models.BooleanField(default=False)
    blob = models.JSONField()  # synthetic dataset incl. ground truth (kept server-side)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL); created_at = models.DateTimeField(auto_now_add=True)

class UploadedEvidence(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE); item = models.JSONField(); result = models.JSONField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL); created_at = models.DateTimeField(auto_now_add=True)

class AssessmentRun(models.Model):
    STATUS = [("queued", "queued"), ("running", "running"), ("done", "done"), ("failed", "failed")]
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE); status = models.CharField(max_length=10, choices=STATUS, default="queued")
    client_config = models.JSONField(default=dict); result = models.JSONField(null=True); error = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True); finished_at = models.DateTimeField(null=True)
    @property
    def run_id(self): return f"RUN-{self.pk:04d}"

class AuditLog(models.Model):
    user = models.CharField(max_length=150); action = models.CharField(max_length=60); detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: ordering = ["-id"]
