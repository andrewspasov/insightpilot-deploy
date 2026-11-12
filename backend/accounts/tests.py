from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


class RegisterViewTests(APITestCase):
    def test_register_returns_tokens_for_auto_login(self):
        response = self.client.post(
            "/accounts/register/",
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "strong-password-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        User = get_user_model()
        self.assertTrue(User.objects.filter(username="newuser", email="newuser@example.com").exists())


class PasswordResetRequestTests(APITestCase):
    url = "/accounts/password-reset/"

    def setUp(self):
        get_user_model().objects.create_user(
            username="resetme", email="resetme@example.com", password="Sup3r-secret-pass"
        )

    def test_sends_reset_email(self):
        from django.core import mail

        res = self.client.post(self.url, {"email": "resetme@example.com"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password/", mail.outbox[0].body)

    def test_mail_server_failure_returns_clear_error(self):
        from unittest import mock

        with mock.patch("accounts.views.send_mail", side_effect=TimeoutError("timed out")):
            with self.assertLogs("accounts.views", level="ERROR"):
                res = self.client.post(self.url, {"email": "resetme@example.com"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("couldn't send the email", res.data["error"])

    def test_unknown_email_gets_same_answer(self):
        res = self.client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
