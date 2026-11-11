from django.urls import path
from . import views as v

urlpatterns = [
    path("demo", v.Demo.as_view()),
    path("login", v.Login.as_view()),
    path("me", v.Me.as_view()),
    path("institution", v.Institution.as_view()),
    path("staff/queue", v.Queue.as_view()),
    path("staff/search", v.Search.as_view()),
    path("staff/policy", v.PolicyView.as_view()),
    path("staff/accounts/<str:code>/freeze", v.Freeze.as_view()),
    path("staff/<str:ref>/<str:action>", v.Action.as_view()),
]