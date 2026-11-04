from django.urls import path

from .views import (
    InsightAICancelActionView,
    InsightAIChatHistoryView,
    InsightAIChatView,
    InsightAIDailyReportView,
    InsightAILoggingStatusView,
    InsightAIConfirmActionView,
    InsightAIPhotoView,
    InsightAIPlanMealsView,
    InsightAIStatusView,
    InsightAITranscribeView,
)

urlpatterns = [
    path("status/", InsightAIStatusView.as_view(), name="insight-ai-status"),
    path("chat/", InsightAIChatView.as_view(), name="insight-ai-chat"),
    path("chat-history/", InsightAIChatHistoryView.as_view(), name="insight-ai-chat-history"),
    path("photo/", InsightAIPhotoView.as_view(), name="insight-ai-photo"),
    path("transcribe/", InsightAITranscribeView.as_view(), name="insight-ai-transcribe"),
    path("actions/<int:action_id>/confirm/", InsightAIConfirmActionView.as_view(), name="insight-ai-confirm-action"),
    path("plans/<int:plan_id>/generate-meals/", InsightAIPlanMealsView.as_view(), name="insight-ai-plan-meals"),
    path("logging-status/", InsightAILoggingStatusView.as_view(), name="insight-ai-logging-status"),
    path("daily-report/", InsightAIDailyReportView.as_view(), name="insight-ai-daily-report"),
    path("actions/<int:action_id>/cancel/", InsightAICancelActionView.as_view(), name="insight-ai-cancel-action"),
]
