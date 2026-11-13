
from django.urls import path
from . import views as v

urlpatterns = [
    path("demo", v.Demo.as_view()),
    path("login", v.Login.as_view()),
    path("me", v.Me.as_view()),

    # Customer portal
    path("customer/login", v.CustomerLogin.as_view()),
    path("customer/dashboard", v.CustomerDashboard.as_view()),
    path("customer/payments/", v.CustomerPayment.as_view()),

    # Institution portal
    path("institution", v.Institution.as_view()),

    # Staff operations
    path("staff/queue", v.Queue.as_view()),
    path("staff/search", v.Search.as_view()),
    path("staff/policy", v.PolicyView.as_view()),
    path("staff/accounts/<str:code>/freeze", v.Freeze.as_view()),
    path("staff/<str:ref>/<str:action>", v.Action.as_view()),
]
