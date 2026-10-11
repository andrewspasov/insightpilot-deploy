from django.urls import path

from .views import (
    InsightAICancelActionView,
    InsightAIChatView,
    InsightAIConfirmActionView,
    InsightAIPhotoView,
    InsightAIStatusView,
    InsightAITranscribeView,
)

urlpatterns = [
    path("status/", InsightAIStatusView.as_view(), name="insight-ai-status"),
    path("chat/", InsightAIChatView.as_view(), name="insight-ai-chat"),
    path("photo/", InsightAIPhotoView.as_view(), name="insight-ai-photo"),
    path("transcribe/", InsightAITranscribeView.as_view(), name="insight-ai-transcribe"),
    path("actions/<int:action_id>/confirm/", InsightAIConfirmActionView.as_view(), name="insight-ai-confirm-action"),
    path("actions/<int:action_id>/cancel/", InsightAICancelActionView.as_view(), name="insight-ai-cancel-action"),
]
