from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("health/", views.health_check, name="health_check"),
    path("me/", views.CurrentUserView.as_view(), name="current-user"),
    path("me/avatar/", views.CurrentUserAvatarView.as_view(), name="current-user-avatar"),
    
    # Login: user sends username + password, gets back access + refresh tokens
    path("login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),

    # Refresh: frontend can use this later to get a new access token
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
