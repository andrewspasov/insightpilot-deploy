import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


def _png_bytes(size=(800, 600)):
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (30, 160, 180)).save(buffer, format="PNG")
    return buffer.getvalue()

class CurrentUserViewTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp(prefix="insightpilot_test_media_")
        cls._override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username="andrej",
            email="andrej@example.com",
            password="secure-pass-123",
            first_name="Andrej",
            last_name="Spasov",
        )
        self.url = "/api/me/"

    def test_get_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_returns_current_user_payload(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "andrej")
        self.assertEqual(response.data["email"], "andrej@example.com")
        self.assertEqual(response.data["full_name"], "Andrej Spasov")
        self.assertIsNone(response.data["avatar_url"])

    def test_patch_updates_full_name_and_email(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "full_name": "Andrej P",
            "email": "andrej.p@example.com",
        }
        response = self.client.patch(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Andrej")
        self.assertEqual(self.user.last_name, "P")
        self.assertEqual(self.user.email, "andrej.p@example.com")

    def test_patch_rejects_duplicate_email(self):
        User.objects.create_user(
            username="taken",
            email="taken@example.com",
            password="secure-pass-123",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"email": "taken@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Email already in use.")

    def test_avatar_upload_updates_avatar_url(self):
        self.client.force_authenticate(user=self.user)
        avatar_file = SimpleUploadedFile(
            "avatar.png",
            _png_bytes(),
            content_type="image/png",
        )
        response = self.client.post(
            "/api/me/avatar/",
            {"avatar": avatar_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar_data.startswith("data:image/jpeg;base64,"))
        self.assertEqual(response.data["avatar_url"], self.user.avatar_data)
        # Stored small: a 256 px JPEG, whatever was uploaded.
        self.assertLess(len(self.user.avatar_data), 60_000)

    def test_avatar_delete_clears_avatar(self):
        self.client.force_authenticate(user=self.user)
        avatar_file = SimpleUploadedFile(
            "avatar.png",
            _png_bytes(),
            content_type="image/png",
        )
        upload_response = self.client.post(
            "/api/me/avatar/",
            {"avatar": avatar_file},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, status.HTTP_200_OK)

        delete_response = self.client.delete("/api/me/avatar/")
        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar_data, "")
        self.assertIsNone(delete_response.data["avatar_url"])


class AvatarUploadValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="pic", email="pic@example.com", password="Sup3r-secret-pass")
        self.client.force_authenticate(user=self.user)

    def test_broken_image_is_refused_clearly(self):
        bad = SimpleUploadedFile("photo.png", b"not really a png", content_type="image/png")
        response = self.client.post("/api/me/avatar/", {"avatar": bad}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("couldn't be read", response.data["detail"])

    def test_me_returns_the_stored_photo(self):
        upload = SimpleUploadedFile("photo.png", _png_bytes((300, 900)), content_type="image/png")
        self.client.post("/api/me/avatar/", {"avatar": upload}, format="multipart")
        response = self.client.get("/api/me/")
        self.assertTrue(response.data["avatar_url"].startswith("data:image/jpeg;base64,"))
