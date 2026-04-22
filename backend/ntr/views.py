# backend/ntr/views.py

import time

from django.core import signing
from django.utils import timezone
from django.contrib.auth import get_user_model

from django.conf import settings
from rest_framework import viewsets, permissions, generics, status, serializers
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response

from .engine import run_ntr_engine_for_track
from .models import Track, TrendSnapshot, NtrSettings, AlertRule
from .alerts import (
    evaluate_alerts_for_track,
    evaluate_alerts_for_tracks,
    build_weekly_digest,
)
from .serializers import (
    TrackSerializer,
    TrendSnapshotSerializer,
    NtrSettingsSerializer,
    AlertRuleSerializer,
)
from .connectors.mercadolibre_client import (
    build_mercadolibre_authorize_url,
    exchange_mercadolibre_code,
)
from billing.permissions import ToolAccessPermission, can_run_tool


class IsOwner(permissions.BasePermission):
    """
    Custom permission: only allow access to objects owned by the requesting user.
    """

    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user


class TrackViewSet(viewsets.ModelViewSet):
    """
    A ModelViewSet gives us:
    - list    (GET    /tracks/)
    - retrieve (GET   /tracks/:id/)
    - create  (POST   /tracks/)
    - update  (PUT/PATCH /tracks/:id/)
    - delete  (DELETE /tracks/:id/)
    """
    queryset = Track.objects.all()
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "ntr"

    def get_queryset(self):
        """
        Only return tracks that belong to the logged in user.
        This way, users cannot see each other's data.
        """
        return Track.objects.filter(owner=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        """
        When creating a new track, force the owner to be the logged in user.
        We do not trust the client to send owner IDs.
        """
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"], url_path="run-mock")
    def run_mock(self, request, pk=None):
        """
        Custom action: POST /api/ntr/tracks/<id>/run-mock/

        This simulates a single automation run for one track:
        - creates a TrendSnapshot with fake metrics
        - updates last_run_at / next_run_at on the track
        - returns both the updated track and the new snapshot
        """

        # get_object() will:
        # - use get_queryset() (so only your own tracks)
        # - fetch the track with the given <id> or 404
        track = self.get_object()

        if track.status == "paused":
            return Response(
                {"detail": "This track is paused. Activate it before running."},
                status=status.HTTP_400_BAD_REQUEST,
        )

        # Ensure settings exist for this user (future engines may use them)
        settings_obj, _created = NtrSettings.objects.get_or_create(owner=request.user)

        # Run the shared engine to generate a snapshot and update scheduling fields
        snapshot = run_ntr_engine_for_track(track, settings_obj)

        # Serialize both objects to send back to the frontend
        track_data = TrackSerializer(track).data
        snapshot_data = TrendSnapshotSerializer(snapshot).data

        return Response(
            {
                "track": track_data,
                "snapshot": snapshot_data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post", "put"], url_path="alert-rules")
    def alert_rules(self, request, pk=None):
        track = self.get_object()

        if request.method == "GET":
            rules = AlertRule.objects.filter(track=track).order_by("rule_type")
            return Response(
                {"ok": True, "rules": AlertRuleSerializer(rules, many=True).data},
                status=status.HTTP_200_OK,
            )

        payload = request.data or {}
        rules_payload = payload.get("rules") or []
        if not isinstance(rules_payload, list) or not rules_payload:
            return Response(
                {"detail": "rules must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enabled_default = bool(payload.get("enabled", True))
        cooldown_default = int(payload.get("cooldown_minutes", 60))
        channels_default = payload.get("channels") or ["email"]

        updated_rules = []
        for rule_data in rules_payload:
            rule_type = rule_data.get("rule_type")
            threshold_value = rule_data.get("threshold_value")
            if rule_type not in dict(AlertRule.RULE_TYPES):
                return Response(
                    {"detail": f"Invalid rule_type: {rule_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                threshold_value = float(threshold_value)
            except (TypeError, ValueError):
                return Response(
                    {"detail": f"Invalid threshold_value for {rule_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if rule_type == AlertRule.RULE_ENGAGEMENT_GT:
                if threshold_value < 0 or threshold_value > 100:
                    return Response(
                        {"detail": "engagement_gt threshold_value must be 0-100"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if rule_type == AlertRule.RULE_VIEWS_SPIKE_PCT:
                if threshold_value < 0 or threshold_value > 1000:
                    return Response(
                        {"detail": "views_spike_pct threshold_value must be 0-1000"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if rule_type == AlertRule.RULE_VIEWS_DROP_PCT:
                if threshold_value < 0 or threshold_value > 1000:
                    return Response(
                        {"detail": "views_drop_pct threshold_value must be 0-1000"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            rule_enabled = bool(rule_data.get("enabled", enabled_default))
            rule_cooldown = int(rule_data.get("cooldown_minutes", cooldown_default))
            rule_channels = rule_data.get("channels") or channels_default

            rule, _ = AlertRule.objects.update_or_create(
                track=track,
                rule_type=rule_type,
                defaults={
                    "user": track.owner,
                    "enabled": rule_enabled,
                    "threshold_value": threshold_value,
                    "cooldown_minutes": rule_cooldown,
                    "channels": rule_channels,
                },
            )
            updated_rules.append(rule)

        return Response(
            {"ok": True, "rules": AlertRuleSerializer(updated_rules, many=True).data},
            status=status.HTTP_200_OK,
        )


class NtrSettingsView(generics.RetrieveUpdateAPIView):
    """
    View for the *current user's* NTR settings.

    - GET   /api/ntr/settings/   -> return this user's settings
    - PATCH /api/ntr/settings/   -> update platforms/sources for this user

    We always work with exactly one row per user.
    If it doesn't exist yet, we create it with empty lists.
    """

    serializer_class = NtrSettingsSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "ntr"

    def get_object(self):
        """
        Always fetch (or create) the NtrSettings row for the logged-in user.
        """
        user = self.request.user

        # get_or_create either returns an existing row or creates a new one.
        settings_obj, _created = NtrSettings.objects.get_or_create(
            owner=user,
            defaults={
                "platforms": [],  # default empty list
                "sources": [],    # default empty list
            },
        )

        return settings_obj


class MercadoLibreOAuthStartView(APIView):
    """
    Start MercadoLibre OAuth flow and return the authorization URL.
    """

    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "ntr"
    tool_access_mode = "write"

    def get(self, request):
        state = signing.dumps(
            {"user_id": request.user.id},
            salt="mercadolibre-oauth",
        )
        try:
            authorize_url = build_mercadolibre_authorize_url(state)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"authorize_url": authorize_url}, status=status.HTTP_200_OK)


class MercadoLibreOAuthCallbackView(APIView):
    """
    Handle MercadoLibre OAuth callback and store tokens on NtrSettings.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            return Response(
                {"detail": "Missing code or state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = signing.loads(state, salt="mercadolibre-oauth", max_age=600)
        except signing.BadSignature:
            return Response(
                {"detail": "Invalid OAuth state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_id = payload.get("user_id")
        if not user_id:
            return Response(
                {"detail": "Missing user id in OAuth state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_run_tool(user, "ntr"):
            return Response(
                {"detail": "Subscription does not allow connecting integrations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            token_data = exchange_mercadolibre_code(code)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in")
        mercadolibre_user_id = token_data.get("user_id", "")

        settings_obj, _ = NtrSettings.objects.get_or_create(
            owner=user,
            defaults={"platforms": [], "sources": []},
        )

        settings_obj.mercadolibre_access_token = access_token
        if refresh_token:
            settings_obj.mercadolibre_refresh_token = refresh_token
        if mercadolibre_user_id:
            settings_obj.mercadolibre_user_id = str(mercadolibre_user_id)
        if isinstance(expires_in, (int, float)) and expires_in > 0:
            settings_obj.mercadolibre_token_expires_at = timezone.now() + timezone.timedelta(
                seconds=int(expires_in)
            )
        settings_obj.save(
            update_fields=[
                "mercadolibre_access_token",
                "mercadolibre_refresh_token",
                "mercadolibre_token_expires_at",
                "mercadolibre_user_id",
            ]
        )

        return Response(
            {
                "ok": True,
                "mercadolibre_user_id": settings_obj.mercadolibre_user_id,
                "token_expires_at": settings_obj.mercadolibre_token_expires_at,
            },
            status=status.HTTP_200_OK,
        )


class MercadoLibreStatusView(APIView):
    """
    Return MercadoLibre token status for the current user.
    """

    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "ntr"

    def get(self, request):
        settings_obj, _ = NtrSettings.objects.get_or_create(
            owner=request.user,
            defaults={"platforms": [], "sources": []},
        )
        return Response(
            {
                "has_access_token": bool(settings_obj.mercadolibre_access_token),
                "has_refresh_token": bool(settings_obj.mercadolibre_refresh_token),
                "token_expires_at": settings_obj.mercadolibre_token_expires_at,
                "mercadolibre_user_id": settings_obj.mercadolibre_user_id,
            },
            status=status.HTTP_200_OK,
        )
    

    
class TrendSnapshotViewSet(viewsets.ModelViewSet):
    """
    Expose trend snapshots via the API.

    - list:   GET /api/ntr/snapshots/
    - create: POST /api/ntr/snapshots/
    - retrieve/update/delete: /api/ntr/snapshots/<id>/

    IMPORTANT:
    - User can only see snapshots for tracks they own.
    """

    queryset = TrendSnapshot.objects.all()
    serializer_class = TrendSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "ntr"

    def get_queryset(self):
        """
        Only return snapshots whose track belongs to the logged-in user.
        """
        user = self.request.user
        return TrendSnapshot.objects.filter(track__owner=user).order_by("-run_at")

    def perform_create(self, serializer):
        """
        When creating a snapshot, we must ensure the track belongs to this user.
        We don't trust the frontend to send a track belonging to someone else.
        """

        user = self.request.user
        track = serializer.validated_data["track"]

        if track.owner != user:
            # You can customize the error message if you want
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You cannot create snapshots for another user's track.")

        serializer.save()


class RunTrackRequestSerializer(serializers.Serializer):
    track_id = serializers.IntegerField()


class InternalRunTrackView(APIView):
    """
    Internal-only endpoint for automation systems (e.g., n8n) to run a track by ID.

    Authentication is handled via a shared secret header:
      - Header: X-INSIGHTPILOT-TOKEN
      - Env:    INSIGHTPILOT_INTERNAL_TOKEN
    """

    permission_classes = [permissions.AllowAny]

    def _check_token(self, request):
        expected = getattr(settings, "INSIGHTPILOT_INTERNAL_TOKEN", "").strip()
        if not expected:
            return Response(
                {"detail": "Server missing INSIGHTPILOT_INTERNAL_TOKEN"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        provided = request.headers.get("X-INSIGHTPILOT-TOKEN")
        if provided != expected:
            return Response(
                {"detail": "Unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return None

    def post(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        payload = RunTrackRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        track_id = payload.validated_data["track_id"]

        try:
            track = Track.objects.get(pk=track_id)
        except Track.DoesNotExist:
            return Response(
                {"detail": "Track not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not can_run_tool(track.owner, "ntr"):
            return Response(
                {"detail": "Subscription does not allow running NTR."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if track.status == "paused":
            return Response(
                {"detail": "This track is paused. Activate it before running."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _ = NtrSettings.objects.get_or_create(
            owner=track.owner,
            defaults={
                "platforms": [],
                "sources": [],
            },
        )

        snapshot = run_ntr_engine_for_track(track, settings_obj)

        return Response(
            {
                "ok": True,
                "track_id": track.id,
                "snapshot_id": snapshot.id,
                "summary": snapshot.summary,
                "run_at": snapshot.run_at,
            },
            status=status.HTTP_200_OK,
        )


class InternalRunAllTracksView(APIView):
    """
    Internal-only endpoint to run all active tracks across all users.
    Auth: X-INSIGHTPILOT-TOKEN must match INSIGHTPILOT_INTERNAL_TOKEN.
    Optional query param: delay_seconds=<float> to throttle between runs.
    """

    permission_classes = [permissions.AllowAny]

    def _check_token(self, request):
        expected = getattr(settings, "INSIGHTPILOT_INTERNAL_TOKEN", "").strip()
        if not expected:
            return Response(
                {"detail": "Server missing INSIGHTPILOT_INTERNAL_TOKEN"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        provided = request.headers.get("X-INSIGHTPILOT-TOKEN")
        if provided != expected:
            return Response(
                {"detail": "Unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return None

    def post(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        try:
            delay_seconds = float(request.query_params.get("delay_seconds", 0)) or 0.0
        except (TypeError, ValueError):
            delay_seconds = 0.0

        tracks = Track.objects.filter(status="active").order_by("id")

        results = {
            "ok": True,
            "total_active_tracks": tracks.count(),
            "ran": 0,
            "errors": [],
        }

        for track in tracks:
            try:
                if not can_run_tool(track.owner, "ntr"):
                    results["errors"].append(
                        {
                            "track_id": track.id,
                            "error": "Subscription does not allow running NTR.",
                        }
                    )
                    continue
                settings_obj, _ = NtrSettings.objects.get_or_create(
                    owner=track.owner,
                    defaults={
                        "platforms": [],
                        "sources": [],
                    },
                )
                run_ntr_engine_for_track(track, settings_obj)
                results["ran"] += 1

                if delay_seconds > 0:
                    time.sleep(delay_seconds)
            except Exception as exc:  # noqa: BLE001
                results["errors"].append(
                    {
                        "track_id": track.id,
                        "error": str(exc),
                    }
                )

        if results["errors"]:
            return Response(results, status=status.HTTP_207_MULTI_STATUS)

        return Response(results, status=status.HTTP_200_OK)


class InternalAlertEvaluateView(APIView):
    permission_classes = [permissions.AllowAny]

    def _check_token(self, request):
        expected = getattr(settings, "INSIGHTPILOT_INTERNAL_TOKEN", "").strip()
        if not expected:
            return Response(
                {"detail": "Server missing INSIGHTPILOT_INTERNAL_TOKEN"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        provided = request.headers.get("X-INSIGHTPILOT-TOKEN")
        if provided != expected:
            return Response(
                {"detail": "Unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return None

    def post(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        track_id = request.data.get("track_id")
        if not track_id:
            return Response(
                {"detail": "track_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            track = Track.objects.get(pk=int(track_id))
        except (Track.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Track not found"}, status=status.HTTP_404_NOT_FOUND)

        if not can_run_tool(track.owner, "ntr"):
            return Response(
                {"detail": "Subscription does not allow running alerts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        events = evaluate_alerts_for_track(track)
        payload = [event.__dict__ for event in events]

        return Response({"ok": True, "events": payload}, status=status.HTTP_200_OK)


class InternalAlertEvaluateBatchView(APIView):
    permission_classes = [permissions.AllowAny]

    def _check_token(self, request):
        expected = getattr(settings, "INSIGHTPILOT_INTERNAL_TOKEN", "").strip()
        if not expected:
            return Response(
                {"detail": "Server missing INSIGHTPILOT_INTERNAL_TOKEN"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        provided = request.headers.get("X-INSIGHTPILOT-TOKEN")
        if provided != expected:
            return Response(
                {"detail": "Unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return None

    def post(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        track_ids = request.data.get("track_ids")
        user_id = request.data.get("user_id")
        due_only = bool(request.data.get("due_only", False))

        if track_ids:
            try:
                track_ids = [int(t) for t in track_ids]
            except (TypeError, ValueError):
                return Response(
                    {"detail": "track_ids must be a list of ints"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif user_id:
            tracks_qs = Track.objects.filter(owner_id=user_id)
            if due_only:
                now = timezone.now()
                tracks_qs = tracks_qs.filter(status="active").filter(
                    next_run_at__lte=now
                )
            track_ids = list(tracks_qs.values_list("id", flat=True))
        else:
            track_ids = list(
                Track.objects.filter(status="active").values_list("id", flat=True)
            )

        tracks = Track.objects.filter(id__in=track_ids).select_related("owner")
        allowed_ids = [t.id for t in tracks if can_run_tool(t.owner, "ntr")]
        events = evaluate_alerts_for_tracks(allowed_ids)
        payload = [event.__dict__ for event in events]
        by_user = {}
        for event in events:
            by_user.setdefault(event.user_id, []).append(event.__dict__)

        return Response(
            {"ok": True, "events": payload, "by_user": by_user},
            status=status.HTTP_200_OK,
        )


class InternalWeeklyDigestView(APIView):
    permission_classes = [permissions.AllowAny]

    def _check_token(self, request):
        expected = getattr(settings, "INSIGHTPILOT_INTERNAL_TOKEN", "").strip()
        if not expected:
            return Response(
                {"detail": "Server missing INSIGHTPILOT_INTERNAL_TOKEN"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        provided = request.headers.get("X-INSIGHTPILOT-TOKEN")
        if provided != expected:
            return Response(
                {"detail": "Unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return None

    def get(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        digests = build_weekly_digest()
        if not digests:
            return Response({"ok": True, "digests": []}, status=status.HTTP_200_OK)

        user_ids = {item["user_id"] for item in digests if item.get("user_id")}
        User = get_user_model()
        users = User.objects.filter(id__in=user_ids)
        allowed_ids = {user.id for user in users if can_run_tool(user, "ntr")}
        filtered = [item for item in digests if item.get("user_id") in allowed_ids]

        return Response({"ok": True, "digests": filtered}, status=status.HTTP_200_OK)
