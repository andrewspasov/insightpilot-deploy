from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from wagtail import urls as wagtail_urls
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls
from accounts.views import InternalUserEmailsView
from ntr.views import (
    InternalRunTrackView,
    InternalRunAllTracksView,
    InternalAlertEvaluateView,
    InternalAlertEvaluateBatchView,
    InternalWeeklyDigestView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/billing/", include("billing.urls")),
    path("accounts/", include("accounts.urls")), # register
    path("api/ntr/", include("ntr.urls")),  # <-- add this line
    path("api/nutrition/", include("nutrition.urls")),
    path("api/insight-ai/", include("insight_ai.urls")),
    re_path(
        r"^api/internal/ntr/run-track/?$",
        InternalRunTrackView.as_view(),
        name="ntr-internal-run-track",
    ),
    re_path(
        r"^api/internal/ntr/run-all/?$",
        InternalRunAllTracksView.as_view(),
        name="ntr-internal-run-all-tracks",
    ),
    re_path(
        r"^api/internal/ntr/alerts/evaluate/?$",
        InternalAlertEvaluateView.as_view(),
        name="ntr-internal-alert-evaluate",
    ),
    re_path(
        r"^api/internal/ntr/alerts/evaluate-batch/?$",
        InternalAlertEvaluateBatchView.as_view(),
        name="ntr-internal-alert-evaluate-batch",
    ),
    re_path(
        r"^api/internal/ntr/digest/weekly/?$",
        InternalWeeklyDigestView.as_view(),
        name="ntr-internal-weekly-digest",
    ),
    re_path(
        r"^api/internal/users/emails/?$",
        InternalUserEmailsView.as_view(),
        name="internal-user-emails",
    ),
    path("cms/documents/", include(wagtaildocs_urls)),
    path("cms/", include(wagtailadmin_urls)),
    path("", include(wagtail_urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
