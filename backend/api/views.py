from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import permissions, status
from rest_framework.decorators import api_view
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()


AVATAR_SIZE_PX = 256


def _avatar_url(user, request=None):
    """The photo as a data URL, ready for <img src> on the website and phone."""
    return user.avatar_data or None


def _avatar_data_url(uploaded) -> str:
    """Square-crop, shrink to 256 px and encode as a JPEG data URL (~20 KB)."""
    import base64
    import io

    from PIL import Image, ImageOps

    image = Image.open(uploaded)
    image = ImageOps.exif_transpose(image)  # phone photos come rotated
    image = ImageOps.fit(image.convert("RGB"), (AVATAR_SIZE_PX, AVATAR_SIZE_PX), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _forget_old_avatar_file(user):
    """Drop the pre-database upload, if any (its file may already be gone)."""
    if not user.avatar:
        return
    name = user.avatar.name
    try:
        user.avatar.storage.delete(name)
    except Exception:  # noqa: BLE001 - the file is often missing on Render
        pass
    user.avatar = None


def _serialize_user(user, request=None) -> dict:
    full_name = f"{user.first_name} {user.last_name}".strip()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": full_name or user.username,
        "date_joined": user.date_joined,
        "avatar_url": _avatar_url(user, request),
    }

# A simple API endpoint to confirm the backend works
@api_view(["GET"])
def health_check(request):
    return Response({"status": "ok", "message": "Django backend is alive!"})


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(_serialize_user(request.user, request), status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        updated_fields: list[str] = []

        full_name = request.data.get("full_name")
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        email = request.data.get("email")

        if full_name is not None:
            full_name_value = str(full_name).strip()
            name_parts = full_name_value.split(maxsplit=1)
            parsed_first = name_parts[0] if name_parts else ""
            parsed_last = name_parts[1] if len(name_parts) > 1 else ""

            if user.first_name != parsed_first:
                user.first_name = parsed_first
                updated_fields.append("first_name")
            if user.last_name != parsed_last:
                user.last_name = parsed_last
                updated_fields.append("last_name")
        else:
            if first_name is not None:
                first_name_value = str(first_name).strip()
                if user.first_name != first_name_value:
                    user.first_name = first_name_value
                    updated_fields.append("first_name")
            if last_name is not None:
                last_name_value = str(last_name).strip()
                if user.last_name != last_name_value:
                    user.last_name = last_name_value
                    updated_fields.append("last_name")

        if email is not None:
            email_value = str(email).strip().lower()
            if not email_value:
                return Response(
                    {"detail": "Email is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_email(email_value)
            except ValidationError:
                return Response(
                    {"detail": "Enter a valid email address."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            email_exists = (
                User.objects.filter(email__iexact=email_value)
                .exclude(pk=user.pk)
                .exists()
            )
            if email_exists:
                return Response(
                    {"detail": "Email already in use."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if user.email != email_value:
                user.email = email_value
                updated_fields.append("email")

        if updated_fields:
            user.save(update_fields=sorted(set(updated_fields)))

        return Response(_serialize_user(user, request), status=status.HTTP_200_OK)


class CurrentUserAvatarView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024

    def post(self, request):
        uploaded_avatar = request.FILES.get("avatar")
        if not uploaded_avatar:
            return Response(
                {"detail": "Missing avatar file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = str(getattr(uploaded_avatar, "content_type", "") or "").lower()
        if not content_type.startswith("image/"):
            return Response(
                {"detail": "Only image uploads are allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_avatar.size > self.MAX_AVATAR_SIZE_BYTES:
            return Response(
                {"detail": "Avatar is too large. Max size is 5MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            data_url = _avatar_data_url(uploaded_avatar)
        except Exception:  # noqa: BLE001 - Pillow raises many types for bad files
            return Response(
                {"detail": "That file couldn't be read as an image. Try a JPG or PNG."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        _forget_old_avatar_file(user)
        user.avatar_data = data_url
        user.save(update_fields=["avatar", "avatar_data"])
        return Response(_serialize_user(user, request), status=status.HTTP_200_OK)

    def delete(self, request):
        user = request.user
        _forget_old_avatar_file(user)
        user.avatar_data = ""
        user.save(update_fields=["avatar", "avatar_data"])
        return Response(_serialize_user(user, request), status=status.HTTP_200_OK)


class NotificationListView(APIView):
    """GET: the user's latest notifications and how many are unread."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from accounts.models import Notification

        items = Notification.objects.filter(user=request.user)[:50]
        return Response(
            {
                "unread_count": Notification.objects.filter(user=request.user, read_at__isnull=True).count(),
                "notifications": [
                    {
                        "id": n.id,
                        "kind": n.kind,
                        "title": n.title,
                        "body": n.body,
                        "link": n.link,
                        "created_at": n.created_at,
                        "read": n.read_at is not None,
                    }
                    for n in items
                ],
            }
        )


class NotificationReadView(APIView):
    """POST {"ids": [...]} marks those as read; {"all": true} marks everything."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.utils import timezone

        from accounts.models import Notification

        unread = Notification.objects.filter(user=request.user, read_at__isnull=True)
        if not request.data.get("all"):
            ids = [i for i in (request.data.get("ids") or []) if isinstance(i, int)]
            unread = unread.filter(id__in=ids)
        updated = unread.update(read_at=timezone.now())
        return Response({"marked": updated})
