import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

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
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR",
            content_type="image/png",
        )
        response = self.client.post(
            "/api/me/avatar/",
            {"avatar": avatar_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(bool(self.user.avatar))
        self.assertIsInstance(response.data.get("avatar_url"), str)
        self.assertIn("/media/avatars/", response.data["avatar_url"])

    def test_avatar_delete_clears_avatar(self):
        self.client.force_authenticate(user=self.user)
        avatar_file = SimpleUploadedFile(
            "avatar.png",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR",
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
        self.assertFalse(bool(self.user.avatar))
        self.assertIsNone(delete_response.data["avatar_url"])
