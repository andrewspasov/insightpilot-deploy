from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.hashers import make_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.core import signing
from django.shortcuts import redirect
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from urllib.parse import urlencode
import requests

User = get_user_model()

@api_view(["POST"])
def register(request):
    """
    Simple signup endpoint.
    Expects: { "username": "...", "email": "...", "password": "..." }
    """
    username = request.data.get("username")
    email = request.data.get("email")
    password = request.data.get("password")

    # 1) Validate required fields
    if not username or not email or not password:
        return Response(
            {"error": "All fields are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 2) Check if username already exists
    if User.objects.filter(username=username).exists():
        return Response(
            {"error": "Username already taken."},
            status=status.HTTP_400_BAD_REQUEST,  # ⬅ VERY IMPORTANT: 400, not 201
        )
        
    if User.objects.filter(email=email).exists():
        return Response(
        {"error": "Email already in use."},
        status=status.HTTP_400_BAD_REQUEST,
    )

    # 3) Create user
    user = User.objects.create(
        username=username,
        email=email,
        password=make_password(password),  # hash the password
    )

    refresh = RefreshToken.for_user(user)

    # 4) Return success + JWT so frontend can auto-login
    return Response(
        {
            "message": "User created successfully.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        },
        status=status.HTTP_201_CREATED,
    )


class InternalUserEmailsView(APIView):
    """
    Internal-only endpoint returning user emails for automation workflows.
    Auth: X-INSIGHTPILOT-TOKEN must match INSIGHTPILOT_INTERNAL_TOKEN.
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

    def get(self, request):
        token_error = self._check_token(request)
        if token_error:
            return token_error

        users = (
            User.objects.filter(is_active=True, email__isnull=False)
            .exclude(email="")
            .order_by("id")
        )

        payload = [{"id": user.id, "email": user.email} for user in users]

        return Response(
            {
                "ok": True,
                "count": len(payload),
                "users": payload,
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            token_generator = PasswordResetTokenGenerator()
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = token_generator.make_token(user)
            base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
            reset_url = f"{base_url}/reset-password/{uid}/{token}"

            subject = "Reset your InsightPilot password"
            message = (
                f"Hi {user.username},\n\n"
                "We received a request to reset your InsightPilot password.\n\n"
                f"Username: {user.username}\n"
                f"Reset link: {reset_url}\n\n"
                "If you did not request a password reset, you can ignore this email."
            )

            html_message = f"""
                <div style=\"font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #f8fafc; padding: 32px;\">
                  <div style=\"max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px;\">
                    <p style=\"margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b;\">InsightPilot Security</p>
                    <h1 style=\"margin: 0 0 12px; font-size: 22px;\">Reset your password</h1>
                    <p style=\"margin: 0 0 12px; font-size: 13px; color: #64748b;\">Username: <strong style=\"color: #0f172a;\">{user.username}</strong></p>
                    <p style=\"margin: 0 0 18px; font-size: 14px; color: #334155;\">
                      We received a request to reset your InsightPilot password. Click the button below to continue.
                    </p>
                    <a href=\"{reset_url}\" style=\"display: inline-block; background: linear-gradient(90deg, #2563eb, #14b8a6); color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600; font-size: 14px;\">Reset password</a>
                    <p style=\"margin: 18px 0 0; font-size: 12px; color: #64748b;\">
                      Or paste this link into your browser:<br />
                      <span style=\"color: #2563eb;\">{reset_url}</span>
                    </p>
                    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                    <p style=\"margin: 0; font-size: 12px; color: #94a3b8;\">
                      If you did not request a password reset, you can ignore this email.
                    </p>
                  </div>
                </div>
            """


            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
                html_message=html_message,
            )

        return Response(
            {"message": "If an account exists for that email, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get("uid")
        token = request.data.get("token")
        password = request.data.get("password")

        if not uid or not token or not password:
            return Response(
                {"error": "uid, token, and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response(
                {"error": "Invalid reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_generator = PasswordResetTokenGenerator()
        if not token_generator.check_token(user, token):
            return Response(
                {"error": "Reset link expired or invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            password_validation.validate_password(password, user=user)
        except Exception as exc:
            return Response(
                {"error": exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save(update_fields=["password"])

        return Response(
            {"message": "Password reset successful."},
            status=status.HTTP_200_OK,
        )


def _oauth_frontend_redirect(params: dict) -> str:
    base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    path = getattr(settings, "FRONTEND_OAUTH_REDIRECT_PATH", "/oauth/callback")
    return f"{base_url}{path}?{urlencode(params)}"


def _get_or_create_social_user(email: str, full_name: str = "") -> User:
    user = User.objects.filter(email__iexact=email).first()
    if user:
        return user

    username_base = email.split("@")[0] or "user"
    username = username_base
    counter = 1
    while User.objects.filter(username=username).exists():
        counter += 1
        username = f"{username_base}{counter}"

    user = User.objects.create(username=username, email=email)
    user.set_unusable_password()
    if full_name and not user.get_full_name():
        parts = full_name.split(" ", 1)
        user.first_name = parts[0]
        if len(parts) > 1:
            user.last_name = parts[1]
    user.save(update_fields=["password", "first_name", "last_name"])
    return user


class GoogleOAuthStartView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        client_id = getattr(settings, "GOOGLE_CLIENT_ID", "").strip()
        redirect_uri = getattr(settings, "GOOGLE_REDIRECT_URI", "").strip()
        if not client_id or not redirect_uri:
            return Response(
                {"detail": "Google OAuth is not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        next_path = request.query_params.get("next") or "/dashboard"
        state = signing.dumps({"next": next_path}, salt="google-oauth")

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        authorize_url = "https://accounts.google.com/o/oauth2/v2/auth"
        return Response(
            {"authorize_url": f"{authorize_url}?{urlencode(params)}"},
            status=status.HTTP_200_OK,
        )


class GoogleOAuthCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            return redirect(_oauth_frontend_redirect({"error": "missing_code_or_state"}))

        try:
            payload = signing.loads(state, salt="google-oauth", max_age=600)
        except signing.BadSignature:
            return redirect(_oauth_frontend_redirect({"error": "invalid_state"}))

        client_id = getattr(settings, "GOOGLE_CLIENT_ID", "").strip()
        client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "").strip()
        redirect_uri = getattr(settings, "GOOGLE_REDIRECT_URI", "").strip()
        if not client_id or not client_secret or not redirect_uri:
            return redirect(_oauth_frontend_redirect({"error": "google_not_configured"}))

        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_resp.status_code != 200:
            return redirect(_oauth_frontend_redirect({"error": "token_exchange_failed"}))

        access_token = token_resp.json().get("access_token")
        if not access_token:
            return redirect(_oauth_frontend_redirect({"error": "missing_access_token"}))

        userinfo_resp = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if userinfo_resp.status_code != 200:
            return redirect(_oauth_frontend_redirect({"error": "userinfo_failed"}))

        profile = userinfo_resp.json()
        email = profile.get("email")
        full_name = profile.get("name", "")
        if not email:
            return redirect(_oauth_frontend_redirect({"error": "missing_email"}))

        user = _get_or_create_social_user(email=email, full_name=full_name)
        refresh = RefreshToken.for_user(user)
        params = {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "provider": "google",
            "next": payload.get("next", "/dashboard"),
        }
        return redirect(_oauth_frontend_redirect(params))


class FacebookOAuthStartView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        app_id = getattr(settings, "FACEBOOK_APP_ID", "").strip()
        redirect_uri = getattr(settings, "FACEBOOK_REDIRECT_URI", "").strip()
        if not app_id or not redirect_uri:
            return Response(
                {"detail": "Facebook OAuth is not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        next_path = request.query_params.get("next") or "/dashboard"
        state = signing.dumps({"next": next_path}, salt="facebook-oauth")

        params = {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": "email,public_profile",
            "response_type": "code",
        }
        authorize_url = "https://www.facebook.com/v19.0/dialog/oauth"
        return Response(
            {"authorize_url": f"{authorize_url}?{urlencode(params)}"},
            status=status.HTTP_200_OK,
        )


class FacebookOAuthCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            return redirect(_oauth_frontend_redirect({"error": "missing_code_or_state"}))

        try:
            payload = signing.loads(state, salt="facebook-oauth", max_age=600)
        except signing.BadSignature:
            return redirect(_oauth_frontend_redirect({"error": "invalid_state"}))

        app_id = getattr(settings, "FACEBOOK_APP_ID", "").strip()
        app_secret = getattr(settings, "FACEBOOK_APP_SECRET", "").strip()
        redirect_uri = getattr(settings, "FACEBOOK_REDIRECT_URI", "").strip()
        if not app_id or not app_secret or not redirect_uri:
            return redirect(_oauth_frontend_redirect({"error": "facebook_not_configured"}))

        token_resp = requests.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=10,
        )
        if token_resp.status_code != 200:
            return redirect(_oauth_frontend_redirect({"error": "token_exchange_failed"}))

        access_token = token_resp.json().get("access_token")
        if not access_token:
            return redirect(_oauth_frontend_redirect({"error": "missing_access_token"}))

        profile_resp = requests.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": access_token},
            timeout=10,
        )
        if profile_resp.status_code != 200:
            return redirect(_oauth_frontend_redirect({"error": "userinfo_failed"}))

        profile = profile_resp.json()
        email = profile.get("email")
        full_name = profile.get("name", "")
        if not email:
            return redirect(_oauth_frontend_redirect({"error": "missing_email"}))

        user = _get_or_create_social_user(email=email, full_name=full_name)
        refresh = RefreshToken.for_user(user)
        params = {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "provider": "facebook",
            "next": payload.get("next", "/dashboard"),
        }
        return redirect(_oauth_frontend_redirect(params))
