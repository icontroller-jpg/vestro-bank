from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views as v
urlpatterns = [
    path("health", v.Health.as_view()), path("auth/token", TokenObtainPairView.as_view()), path("auth/refresh", TokenRefreshView.as_view()),
    path("me", v.Me.as_view()), path("dataset", v.DatasetView.as_view()), path("source/<str:module>", v.Source.as_view()),
    path("evidence", v.EvidenceView.as_view()), path("runs", v.Runs.as_view()), path("runs/<int:pk>", v.RunDetail.as_view()),
    path("runs/<int:pk>/findings", v.Findings.as_view()), path("runs/<int:pk>/report", v.Report.as_view()),
    path("runs/<int:pk>/validation", v.Validation.as_view()), path("groundtruth", v.GroundTruth.as_view()), path("audit-log", v.Audit.as_view()),
]
