from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import InsightAIChatSerializer
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

        try:
            assert_chat_allowed(request.user)
            result = call_ai(
                request.user,
                serializer.validated_data["message"],
                serializer.validated_data.get("history", []),
            )
        except InsightAIError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(
            {
                "reply": result.text,
                "provider": get_ai_provider(),
                "model": get_ai_model(),
                "usage": {
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                    "total_tokens": result.total_tokens,
                },
                "monthly_usage": get_monthly_usage(request.user),
            },
            status=status.HTTP_200_OK,
        )
