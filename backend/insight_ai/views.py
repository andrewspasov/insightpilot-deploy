from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import InsightAIChatSerializer
from .actions import (
    cancel_pending_action,
    confirm_pending_action,
    create_pending_action,
    infer_log_meal_action_from_message,
    serialize_action,
)
from .vision import analyze_food_photo
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
            pending_action = create_pending_action(
                request.user,
                proposed_action,
                message=message,
            )
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
            action = confirm_pending_action(request.user, action_id)
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
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        image_base64 = str(request.data.get("image_base64") or "").strip()
        mime_type = str(request.data.get("mime_type") or "image/jpeg").strip()
        if not image_base64:
            return Response({"detail": "image_base64 is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(image_base64) > 8_000_000:
            return Response({"detail": "Image is too large. Use a smaller photo."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assert_chat_allowed(request.user)
            result = analyze_food_photo(request.user, image_base64, mime_type)
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
