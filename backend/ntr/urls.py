from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TrackViewSet,
    NtrSettingsView,
    TrendSnapshotViewSet,
    MercadoLibreOAuthStartView,
    MercadoLibreOAuthCallbackView,
    MercadoLibreStatusView,
)

router = DefaultRouter()
router.register("tracks", TrackViewSet, basename="ntr-track")
router.register("snapshots", TrendSnapshotViewSet, basename="ntr-snapshots")

urlpatterns = [
    path("", include(router.urls)),
    path("settings/", NtrSettingsView.as_view(), name="ntr-settings"),
    path("mercadolibre/oauth/start/", MercadoLibreOAuthStartView.as_view(), name="mercadolibre-oauth-start"),
    path("mercadolibre/oauth/callback/", MercadoLibreOAuthCallbackView.as_view(), name="mercadolibre-oauth-callback"),
    path("mercadolibre/status/", MercadoLibreStatusView.as_view(), name="mercadolibre-status"),
]
