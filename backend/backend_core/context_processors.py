from django.conf import settings


def public_urls(_request):
    frontend_base_url = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    return {
        "frontend_base_url": frontend_base_url or "/",
    }
