from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("lab.urls")),
    path("api/portal/", include("portal.urls")),
]