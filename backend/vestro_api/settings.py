import os, sys
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR.parent))          # makes vestro_core importable
env = os.environ.get
DJANGO_DEBUG=1
DEBUG = env("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = env("DJANGO_SECRET_KEY") or ("dev-only-insecure-key" if DEBUG else None)
if not SECRET_KEY: raise RuntimeError("Set DJANGO_SECRET_KEY (or DJANGO_DEBUG=1 for local dev)")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "django.contrib.messages",
                  "django.contrib.staticfiles", "rest_framework", "corsheaders", "lab", "portal",]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "corsheaders.middleware.CorsMiddleware",
              "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware",
              "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware",
              "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware"]
ROOT_URLCONF = "vestro_api.urls"
WSGI_APPLICATION = "vestro_api.wsgi.application"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "APP_DIRS": True,
              "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth",
                                                 "django.contrib.messages.context_processors.messages"]}}]
if env("POSTGRES_HOST"):
    DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": env("POSTGRES_DB", "vestro"), "USER": env("POSTGRES_USER", "vestro"),
                             "PASSWORD": env("POSTGRES_PASSWORD"), "HOST": env("POSTGRES_HOST"), "PORT": env("POSTGRES_PORT", "5432")}}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
AUTH_PASSWORD_VALIDATORS = [{"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
                            {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"}]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "static/"; STATIC_ROOT = BASE_DIR / "staticfiles"; USE_TZ = True; TIME_ZONE = "UTC"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.UserRateThrottle", "rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"user": env("THROTTLE_USER", "600/min"), "anon": env("THROTTLE_ANON", "30/min")},
    "URL_FORMAT_OVERRIDE": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
SIMPLE_JWT = {"ACCESS_TOKEN_LIFETIME": timedelta(minutes=15), "REFRESH_TOKEN_LIFETIME": timedelta(hours=8)}
CORS_ALLOWED_ORIGINS = [o for o in env("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
if not DEBUG:
    SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT", "1") == "1"; SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
    SECURE_HSTS_SECONDS = 31536000 if SECURE_SSL_REDIRECT else 0
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
# async assessment runs: Redis + Celery in production, inline in dev/tests
CELERY_ENABLED = env("CELERY_ENABLED", "0") == "1"
CELERY_BROKER_URL = env("REDIS_URL", "redis://localhost:6379/0"); CELERY_RESULT_BACKEND = CELERY_BROKER_URL
# Real Rebel endpoint is server-side config only (never accepted from API callers -> no SSRF)
REBEL_BASE_URL, REBEL_TOKEN = env("REBEL_BASE_URL", ""), env("REBEL_TOKEN", "")
