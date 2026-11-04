from __future__ import annotations

import logging
from datetime import date

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import InsightAIChatSerializer
from nutrition.models import Plan
from nutrition.serializers import PlanMealOptionSerializer

from .actions import (
    PlanProposalError,
    cancel_pending_action,
    confirm_pending_action,
    create_pending_action,
    infer_log_meal_action_from_message,
    serialize_action,
)
from .coach_reports import logging_status, send_daily_report
from .meal_plans import generate_meal_options
from .models import InsightAIAction, InsightAIChat
from .vision import analyze_food_photo, analyze_nutrition_label
from .transcription import transcribe_audio
from .services import (
    InsightAIError,
    assert_chat_allowed,
    call_ai,
    get_ai_model,
    get_ai_provider,
    get_limits,
    get_monthly_usage,
    is_configured,
    user_has_nutrition_access,
    user_has_private_ai_access,
)

logger = logging.getLogger(__name__)


class InsightAIStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        nutrition_access = user_has_nutrition_access(request.user)
        private_access = user_has_private_ai_access(request.user)
        configured = is_configured()
        return Response(
            {
                "configured": configured,
                "provider": get_ai_provider(),
                "model": get_ai_model(),
                "nutrition_access": nutrition_access,
                "private_access": private_access,
                "can_chat": configured and nutrition_access and private_access,
                "limits": get_limits(),
                "usage": get_monthly_usage(request.user),
            },
            status=status.HTTP_200_OK,
        )


class InsightAIChatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = InsightAIChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = serializer.validated_data.get("message", "")
        image_base64 = serializer.validated_data.get("image_base64", "")
        mime_type = serializer.validated_data.get("mime_type", "image/jpeg")

        try:
            assert_chat_allowed(request.user)
            result = call_ai(
                request.user,
                message,
                serializer.validated_data.get("history", []),
                image_base64,
                mime_type,
            )
            reply = result.text
            proposed_action = result.proposed_action
            # The text-only regex fallback can't interpret an image, so skip it
            # when the user attached one.
            if proposed_action is None and not image_base64:
                proposed_action = infer_log_meal_action_from_message(message)
                if proposed_action is not None:
                    reply = "I prepared this for review using a generic nutrition estimate."
            try:
                pending_action = create_pending_action(
                    request.user,
                    proposed_action,
                    message=message,
                )
            except PlanProposalError as exc:
                # Keep the conversation going: say what was wrong instead of failing the turn.
                pending_action = None
                reply = f"{reply}\n\nI couldn't prepare that yet: {exc}"
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(
            {
                "reply": reply,
                "provider": get_ai_provider(),
                "model": get_ai_model(),
                "usage": {
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                    "total_tokens": result.total_tokens,
                },
                "pending_action": serialize_action(pending_action),
                "monthly_usage": get_monthly_usage(request.user),
            },
            status=status.HTTP_200_OK,
        )


class InsightAIConfirmActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, action_id: int):
        if not user_has_nutrition_access(request.user):
            return Response({"detail": "Nutrition access is required to use InsightPilot AI."}, status=403)
        if not user_has_private_ai_access(request.user):
            return Response({"detail": "InsightPilot AI is private for testing."}, status=403)

        try:
            options = request.data if isinstance(request.data, dict) else {}
            action = confirm_pending_action(request.user, action_id, options)
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response({"action": serialize_action(action)}, status=status.HTTP_200_OK)


class InsightAICancelActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, action_id: int):
        if not user_has_nutrition_access(request.user):
            return Response({"detail": "Nutrition access is required to use InsightPilot AI."}, status=403)
        if not user_has_private_ai_access(request.user):
            return Response({"detail": "InsightPilot AI is private for testing."}, status=403)

        try:
            action = cancel_pending_action(request.user, action_id)
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response({"action": serialize_action(action)}, status=status.HTTP_200_OK)


class InsightAIPhotoView(APIView):
    """Estimate the foods in a meal photo, or (mode=label) read a nutrition label."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        analyze = analyze_nutrition_label if request.data.get("mode") == "label" else analyze_food_photo
        image_base64 = str(request.data.get("image_base64") or "").strip()
        mime_type = str(request.data.get("mime_type") or "image/jpeg").strip()
        if not image_base64:
            return Response({"detail": "image_base64 is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(image_base64) > 8_000_000:
            return Response({"detail": "Image is too large. Use a smaller photo."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assert_chat_allowed(request.user)
            result = analyze(request.user, image_base64, mime_type)
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(
            {
                **result,
                "provider": get_ai_provider(),
                "model": get_ai_model(),
                "monthly_usage": get_monthly_usage(request.user),
            },
            status=status.HTTP_200_OK,
        )


class InsightAITranscribeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        audio_base64 = str(request.data.get("audio_base64") or "").strip()
        mime_type = str(request.data.get("mime_type") or "audio/m4a").strip()
        if not audio_base64:
            return Response({"detail": "audio_base64 is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(audio_base64) > 12_000_000:
            return Response(
                {"detail": "Recording is too long. Keep it under about a minute."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            assert_chat_allowed(request.user)
            text = transcribe_audio(request.user, audio_base64, mime_type)
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response({"text": text}, status=status.HTTP_200_OK)


class InsightAIPlanMealsView(APIView):
    """Generate (or regenerate) example meals for one of the user's plans."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, plan_id: int):
        plan = Plan.objects.filter(id=plan_id, owner=request.user).first()
        if plan is None:
            return Response({"detail": "Plan not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            assert_chat_allowed(request.user)
            generate_meal_options(request.user, plan)
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)
        return Response(
            {
                "meal_options": PlanMealOptionSerializer(plan.meal_options.all(), many=True).data,
                "monthly_usage": get_monthly_usage(request.user),
            },
            status=status.HTTP_200_OK,
        )


class InsightAILoggingStatusView(APIView):
    """Days since the user last logged, for the coach's 'we miss you' pop-up and phone reminders."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not user_has_nutrition_access(request.user):
            return Response({"detail": "Nutrition access is required."}, status=status.HTTP_403_FORBIDDEN)
        return Response(logging_status(request.user), status=status.HTTP_200_OK)


class InsightAIDailyReportView(APIView):
    """Email the user a report of today (or ?date=YYYY-MM-DD) right now."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not user_has_nutrition_access(request.user):
            return Response({"detail": "Nutrition access is required."}, status=status.HTTP_403_FORBIDDEN)
        raw_date = request.data.get("date")
        try:
            day = date.fromisoformat(raw_date) if raw_date else timezone.localdate()
        except (TypeError, ValueError):
            return Response({"detail": "date must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sent_to = send_daily_report(request.user, day)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Daily report email failed for user %s", request.user.pk)
            return Response(
                {"detail": "Could not send the email. Please try again later."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"sent_to": sent_to}, status=status.HTTP_200_OK)


CHAT_HISTORY_LIMIT = 50


def _clean_chat_messages(raw) -> list[dict]:
    """Keep the newest well-formed messages. Action cards are stored by id only."""
    cleaned = []
    for message in raw if isinstance(raw, list) else []:
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            continue
        item = {
            "id": str(message.get("id") or "")[:80],
            "role": message["role"],
            "content": str(message.get("content") or "")[:8000],
        }
        if isinstance(message.get("timestamp"), str):
            item["timestamp"] = message["timestamp"][:40]
        if isinstance(message.get("imageUri"), str):
            item["imageUri"] = message["imageUri"][:500]
        action = message.get("pendingAction")
        if isinstance(action, dict) and isinstance(action.get("id"), int):
            item["pendingAction"] = action["id"]
        cleaned.append(item)
    return cleaned[-CHAT_HISTORY_LIMIT:]


def _chat_messages_for_client(user, messages: list[dict]) -> list[dict]:
    # Cards come from the action table so a confirm on one device shows on the other.
    ids = [m["pendingAction"] for m in messages if isinstance(m.get("pendingAction"), int)]
    actions = {a.id: a for a in InsightAIAction.objects.filter(user=user, id__in=ids)}
    result = []
    for message in messages:
        item = dict(message)
        action_id = item.pop("pendingAction", None)
        if action_id is not None:
            item["pendingAction"] = serialize_action(actions.get(action_id))
        result.append(item)
    return result


class InsightAIChatHistoryView(APIView):
    """The saved coach conversation: GET it, POST the whole list to replace it, DELETE to start over."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        chat = InsightAIChat.objects.filter(user=request.user).first()
        messages = chat.messages if chat else []
        return Response({"messages": _chat_messages_for_client(request.user, messages)})

    def post(self, request):
        messages = _clean_chat_messages(request.data.get("messages"))
        InsightAIChat.objects.update_or_create(user=request.user, defaults={"messages": messages})
        return Response({"saved": len(messages)})

    def delete(self, request):
        InsightAIChat.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
