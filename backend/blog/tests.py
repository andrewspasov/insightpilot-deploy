from django.test import Client, TestCase
from django.utils import timezone

from wagtail.models import Page, Site

from .models import (
    BlogCategory,
    BlogIndexPage,
    BlogPostPage,
    CallToActionSnippet,
)


class BlogSmokeTests(TestCase):
    """Ensure the blog pages render and basic fields work."""

    def setUp(self):
        self.client = Client()
        self.root = Site.objects.get(is_default_site=True).root_page
        self.blog_index = BlogIndexPage(title="Blog", slug="blog")
        self.root.add_child(instance=self.blog_index)
        self.blog_index.save_revision().publish()

        self.category = BlogCategory.objects.create(name="AI", slug="ai")
        self.cta_snippet = CallToActionSnippet.objects.create(
            title="Try InsightPilot",
            text="Spin up automation quickly.",
            button_label="Get started",
            button_url="https://example.com",
        )

        body = [
            ("heading", {"level": "h2", "text": "Intro"}),
            ("paragraph", "This is a test paragraph about InsightPilot."),
            ("cta_snippet", {"snippet": self.cta_snippet}),
        ]

        self.post = BlogPostPage(
            title="Test Post",
            slug="test-post",
            excerpt="Short excerpt",
            date=timezone.now(),
            body=body,
            author_name="Test Author",
        )
        self.blog_index.add_child(instance=self.post)
        self.post.categories.add(self.category)
        self.post.tags.add("testing")
        self.post.save_revision().publish()

    def test_blog_index_renders(self):
        response = self.client.get(self.blog_index.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Blog")

    def test_blog_post_renders(self):
        response = self.client.get(self.post.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Post")
        self.assertContains(response, "Short excerpt")

    def test_read_time_is_positive(self):
        self.assertGreaterEqual(self.post.estimated_read_time, 1)
