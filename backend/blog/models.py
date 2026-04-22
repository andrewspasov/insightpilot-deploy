"""
Wagtail blog models: index page, post page, categories, tags, and reusable CTAs.
"""

import math
import re
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db import models
from django.utils import timezone

from wagtail import blocks
from modelcluster.contrib.taggit import ClusterTaggableManager
from modelcluster.fields import ParentalKey, ParentalManyToManyField
from taggit.models import Tag, TaggedItemBase
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.fields import RichTextField, StreamField
from wagtail.models import Page
from wagtail.search import index
from wagtail.snippets.models import register_snippet

from . import blocks as blog_blocks


@register_snippet
class BlogCategory(models.Model):
    """Simple category snippet for grouping posts."""

    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(unique=True)
    color = models.CharField(
        max_length=16,
        blank=True,
        help_text="Optional HEX color for badges (e.g. #0d9488).",
    )
    icon = models.CharField(
        max_length=64,
        blank=True,
        help_text="Optional emoji or icon class used in templates.",
    )

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        FieldPanel("color"),
        FieldPanel("icon"),
    ]

    class Meta:
        verbose_name = "Blog category"
        verbose_name_plural = "Blog categories"

    def __str__(self):
        return self.name


@register_snippet
class CallToActionSnippet(models.Model):
    """Reusable CTA box that can be dropped into any post via SnippetChooserBlock."""

    title = models.CharField(max_length=120)
    text = models.TextField(blank=True)
    button_label = models.CharField(max_length=64)
    button_url = models.URLField()

    panels = [
        FieldPanel("title"),
        FieldPanel("text"),
        FieldPanel("button_label"),
        FieldPanel("button_url"),
    ]

    class Meta:
        verbose_name = "Call to action"
        verbose_name_plural = "Call to actions"

    def __str__(self):
        return self.title


class BlogPostPageTag(TaggedItemBase):
    """Taggit through model so tags work with Wagtail's ClusterTaggableManager."""

    content_object = ParentalKey(
        "BlogPostPage", related_name="tagged_items", on_delete=models.CASCADE
    )


class BlogIndexPage(Page):
    """Lists blog posts with search, filter, and pagination."""

    intro = RichTextField(blank=True)
    per_page = 10  # default pagination size

    content_panels = Page.content_panels + [
        FieldPanel("intro"),
    ]

    subpage_types = ["blog.BlogPostPage"]

    def get_context(self, request, *args, **kwargs):
        """Build listing with filters: ?page=, ?category=slug, ?tag=slug, ?q=search."""
        context = super().get_context(request, *args, **kwargs)
        posts = (
            BlogPostPage.objects.child_of(self)
            .live()
            .order_by("-first_published_at", "-latest_revision_created_at")
        )

        category_slug = request.GET.get("category")
        tag_slug = request.GET.get("tag")
        search_query = request.GET.get("q")

        if category_slug:
            posts = posts.filter(categories__slug=category_slug)
        if tag_slug:
            posts = posts.filter(tags__slug=tag_slug)
        if search_query:
            posts = posts.filter(
                models.Q(title__icontains=search_query)
                | models.Q(excerpt__icontains=search_query)
                | models.Q(search_description__icontains=search_query)
            )

        paginator = Paginator(posts, self.per_page)
        page_number = request.GET.get("page")
        try:
            paginated = paginator.page(page_number)
        except PageNotAnInteger:
            paginated = paginator.page(1)
        except EmptyPage:
            paginated = paginator.page(paginator.num_pages)

        context.update(
            {
                "posts": paginated,
                "categories": BlogCategory.objects.all(),
                "tags": Tag.objects.all(),
                "active_category": category_slug,
                "active_tag": tag_slug,
                "search_query": search_query or "",
            }
        )
        return context


class BlogPostPage(Page):
    """Rich article page with flexible StreamField blocks."""

    date = models.DateField("Post date", default=timezone.now)
    author_name = models.CharField(max_length=120, blank=True)
    hero_image = models.ForeignKey(
        "wagtailimages.Image",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    og_image = models.ForeignKey(
        "wagtailimages.Image",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Used for social sharing cards; falls back to hero if empty.",
    )
    excerpt = models.TextField(blank=True)
    focus_keyword = models.CharField(
        max_length=120, blank=True, help_text="Optional focus keyword for SEO."
    )
    canonical_url = models.URLField(blank=True)
    categories = ParentalManyToManyField("blog.BlogCategory", blank=True)
    tags = ClusterTaggableManager(through=BlogPostPageTag, blank=True)

    body = StreamField(
        [
            ("hero", blog_blocks.HeroSectionBlock()),
            ("table_of_contents", blog_blocks.TableOfContentsBlock()),
            (
                "rich_text",
                blocks.RichTextBlock(
                    features=[
                        "h2",
                        "h3",
                        "bold",
                        "italic",
                        "link",
                        "ol",
                        "ul",
                        "hr",
                    ]
                ),
            ),
            ("heading", blog_blocks.HeadingBlock()),
            (
                "paragraph",
                blocks.RichTextBlock(
                    features=["h2", "h3", "bold", "italic", "link", "ol", "ul", "hr"]
                ),
            ),
            ("quote", blog_blocks.QuoteBlock()),
            ("callout", blog_blocks.CalloutBlock()),
            ("code", blog_blocks.CodeBlock()),
            ("table", blog_blocks.TableBlock()),
            ("image", blog_blocks.ImageBlock()),
            ("image_gallery", blog_blocks.ImageGalleryBlock()),
            ("video", blog_blocks.VideoEmbedBlock()),
            ("embed", blog_blocks.VideoEmbedBlock()),  # alias for older data
            ("raw_html", blog_blocks.RawHTMLBlock()),
            ("two_column", blog_blocks.TwoColumnBlock()),
            ("feature_grid", blog_blocks.FeatureGridBlock()),
            ("call_to_action", blog_blocks.SimpleLinkCTABlock()),  # legacy simple CTA
            ("cta", blog_blocks.CallToActionBlock()),
            ("cta_snippet", blog_blocks.CTAFromSnippetBlock()),
            ("divider", blog_blocks.DividerBlock()),
            ("faq", blog_blocks.FAQBlock()),
            ("accordion", blog_blocks.AccordionBlock()),
            ("toc_marker", blog_blocks.TableOfContentsBlock()),  # backwards-compatible marker
        ],
        use_json_field=True,
        blank=True,
    )

    content_panels = Page.content_panels + [
        FieldPanel("date"),
        FieldPanel("author_name"),
        FieldPanel("hero_image"),
        FieldPanel("og_image"),
        FieldPanel("excerpt"),
        FieldPanel("categories"),
        FieldPanel("tags"),
        FieldPanel("body"),
    ]

    promote_panels = Page.promote_panels + [
        MultiFieldPanel(
            [
                FieldPanel("focus_keyword"),
                FieldPanel("canonical_url"),
            ],
            heading="SEO extras",
        )
    ]

    parent_page_types = ["blog.BlogIndexPage"]
    subpage_types = []

    search_fields = Page.search_fields + [
        index.SearchField("excerpt"),
        index.SearchField("body"),
        index.SearchField("focus_keyword"),
    ]

    def get_meta_image(self):
        """Use og_image first, then hero_image."""
        return self.og_image or self.hero_image

    @property
    def estimated_read_time(self):
        """
        Rough read time in minutes (200 wpm).
        Counts words from excerpt + text-like StreamField blocks.
        """
        word_source = [self.excerpt or ""]
        for block in self.body:
            if block.block_type in {"rich_text", "paragraph"}:
                word_source.append(block.value.source if hasattr(block.value, "source") else str(block.value))
            elif block.block_type == "heading":
                word_source.append(block.value.get("text", ""))
        words = re.findall(r"\w+", " ".join(word_source))
        minutes = max(1, math.ceil(len(words) / 200))
        return minutes
