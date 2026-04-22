from django.urls import path
from .views import (
    register,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    GoogleOAuthStartView,
    GoogleOAuthCallbackView,
    FacebookOAuthStartView,
    FacebookOAuthCallbackView,
)

urlpatterns = [
    path("register/", register, name="register"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("oauth/google/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path("oauth/google/callback/", GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
    path("oauth/facebook/start/", FacebookOAuthStartView.as_view(), name="facebook-oauth-start"),
    path("oauth/facebook/callback/", FacebookOAuthCallbackView.as_view(), name="facebook-oauth-callback"),
]
