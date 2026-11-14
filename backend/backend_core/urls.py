from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from wagtail import urls as wagtail_urls
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/billing/", include("billing.urls")),
    path("accounts/", include("accounts.urls")), # register
    path("api/nutrition/", include("nutrition.urls")),
    path("api/insight-ai/", include("insight_ai.urls")),
    path("cms/documents/", include(wagtaildocs_urls)),
    path("cms/", include(wagtailadmin_urls)),
    path("", include(wagtail_urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
