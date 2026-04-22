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
