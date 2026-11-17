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


from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.core import signing
from django.test import override_settings


def _fake_response(status_code=200, payload=None):
    response = mock.Mock()
    response.status_code = status_code
    response.json.return_value = payload or {}
    return response


@override_settings(
    FRONTEND_BASE_URL="https://web.example",
    GOOGLE_CLIENT_ID="gid",
    GOOGLE_CLIENT_SECRET="gsecret",
    GOOGLE_REDIRECT_URI="https://api.example/accounts/oauth/google/callback/",
    FACEBOOK_APP_ID="fid",
    FACEBOOK_APP_SECRET="fsecret",
    FACEBOOK_REDIRECT_URI="https://api.example/accounts/oauth/facebook/callback/",
)
class SocialLoginTests(APITestCase):
    def _callback(self, provider, next_path="/dashboard/billing"):
        state = signing.dumps({"next": next_path}, salt=f"{provider}-oauth")
        return self.client.get(f"/accounts/oauth/{provider}/callback/", {"code": "abc", "state": state})

    @staticmethod
    def _fragment(response):
        url = urlparse(response["Location"])
        return url, {k: v[0] for k, v in parse_qs(url.fragment).items()}

    def test_start_links_to_google_with_account_picker_and_safe_next(self):
        data = self.client.get("/accounts/oauth/google/start/", {"next": "//evil.example"}).data
        query = parse_qs(urlparse(data["authorize_url"]).query)
        self.assertEqual(query["prompt"], ["select_account"])
        self.assertNotIn("access_type", query)
        state = signing.loads(query["state"][0], salt="google-oauth")
        self.assertEqual(state["next"], "/dashboard")

    @mock.patch("accounts.views.requests.get")
    @mock.patch("accounts.views.requests.post")
    def test_google_creates_the_user_and_returns_tokens_in_the_fragment(self, mock_post, mock_get):
        mock_post.return_value = _fake_response(payload={"access_token": "g-token"})
        mock_get.return_value = _fake_response(
            payload={"email": "new.person@gmail.com", "email_verified": True, "name": "New Person"}
        )
        response = self._callback("google")
        url, fragment = self._fragment(response)
        self.assertEqual(url.path, "/oauth/callback")
        self.assertEqual(url.query, "")  # nothing in the query string
        self.assertIn("access", fragment)
        self.assertEqual(fragment["next"], "/dashboard/billing")
        user = get_user_model().objects.get(email="new.person@gmail.com")
        self.assertEqual(user.first_name, "New")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.notifications.first().kind, "welcome")

    @mock.patch("accounts.views.requests.get")
    @mock.patch("accounts.views.requests.post")
    def test_google_signs_in_an_existing_account_by_verified_email(self, mock_post, mock_get):
        existing = get_user_model().objects.create_user(username="old", email="Old@Example.com", password="Sup3r-secret-pass")
        mock_post.return_value = _fake_response(payload={"access_token": "g-token"})
        mock_get.return_value = _fake_response(payload={"email": "old@example.com", "email_verified": True})
        _, fragment = self._fragment(self._callback("google"))
        self.assertIn("access", fragment)
        self.assertEqual(get_user_model().objects.filter(email__iexact="old@example.com").count(), 1)
        existing.refresh_from_db()
        self.assertTrue(existing.has_usable_password())

    @mock.patch("accounts.views.requests.get")
    @mock.patch("accounts.views.requests.post")
    def test_google_refuses_an_unverified_email(self, mock_post, mock_get):
        mock_post.return_value = _fake_response(payload={"access_token": "g-token"})
        mock_get.return_value = _fake_response(payload={"email": "someone@example.com", "email_verified": False})
        _, fragment = self._fragment(self._callback("google"))
        self.assertEqual(fragment, {"error": "email_not_verified"})
        self.assertFalse(get_user_model().objects.filter(email="someone@example.com").exists())

    def test_tampered_state_is_refused(self):
        response = self.client.get("/accounts/oauth/google/callback/", {"code": "abc", "state": "forged"})
        _, fragment = self._fragment(response)
        self.assertEqual(fragment, {"error": "invalid_state"})

    def test_phone_start_marks_the_state_as_app(self):
        data = self.client.get("/accounts/oauth/google/start/", {"client": "mobile"}).data
        query = parse_qs(urlparse(data["authorize_url"]).query)
        self.assertTrue(signing.loads(query["state"][0], salt="google-oauth")["app"])
        # The website's start has no app flag.
        data = self.client.get("/accounts/oauth/google/start/").data
        query = parse_qs(urlparse(data["authorize_url"]).query)
        self.assertNotIn("app", signing.loads(query["state"][0], salt="google-oauth"))

    @mock.patch("accounts.views.requests.get")
    @mock.patch("accounts.views.requests.post")
    def test_phone_sign_in_goes_back_to_the_app(self, mock_post, mock_get):
        mock_post.return_value = _fake_response(payload={"access_token": "g-token"})
        mock_get.return_value = _fake_response(payload={"email": "phone@example.com", "email_verified": True})
        state = signing.dumps({"next": "/dashboard", "app": True}, salt="google-oauth")
        response = self.client.get("/accounts/oauth/google/callback/", {"code": "abc", "state": state})
        url, fragment = self._fragment(response)
        self.assertEqual((url.scheme, url.netloc), ("insightpilot", "oauth"))
        self.assertIn("access", fragment)
        self.assertIn("refresh", fragment)

    def test_cancelled_phone_sign_in_goes_back_to_the_app(self):
        state = signing.dumps({"next": "/dashboard", "app": True}, salt="facebook-oauth")
        response = self.client.get("/accounts/oauth/facebook/callback/", {"error": "access_denied", "state": state})
        url, fragment = self._fragment(response)
        self.assertEqual(url.scheme, "insightpilot")
        self.assertEqual(fragment, {"error": "missing_code_or_state"})

    @mock.patch("accounts.views.requests.get")
    def test_facebook_creates_the_user(self, mock_get):
        mock_get.side_effect = [
            _fake_response(payload={"access_token": "f-token"}),
            _fake_response(payload={"id": "1", "name": "Face Book", "email": "fb.person@example.com"}),
        ]
        _, fragment = self._fragment(self._callback("facebook"))
        self.assertEqual(fragment["provider"], "facebook")
        self.assertTrue(get_user_model().objects.filter(email="fb.person@example.com").exists())

    @mock.patch("accounts.views.requests.get")
    def test_facebook_without_email_explains_it(self, mock_get):
        mock_get.side_effect = [
            _fake_response(payload={"access_token": "f-token"}),
            _fake_response(payload={"id": "1", "name": "No Email"}),
        ]
        _, fragment = self._fragment(self._callback("facebook"))
        self.assertEqual(fragment, {"error": "missing_email"})
