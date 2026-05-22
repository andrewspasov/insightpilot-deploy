from django.urls import path

from .views import InsightAIChatView, InsightAIStatusView

urlpatterns = [
    path("status/", InsightAIStatusView.as_view(), name="insight-ai-status"),
    path("chat/", InsightAIChatView.as_view(), name="insight-ai-chat"),
]
