"""
StreamField blocks for the blog "page builder".

These are split into content, layout, media, navigation, and utility blocks.
Templates live in backend/templates/blog/blocks/.
"""

from wagtail import blocks
from wagtail.contrib.table_block.blocks import TableBlock
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock


class HeadingBlock(blocks.StructBlock):
    """Semantic heading with selectable level."""

    level = blocks.ChoiceBlock(
        choices=[("h2", "H2"), ("h3", "H3"), ("h4", "H4")],
        default="h2",
        help_text="Choose the heading level.",
    )
    text = blocks.CharBlock(required=True, help_text="Heading text.")

    class Meta:
        icon = "title"
        template = "blog/blocks/heading.html"


class QuoteBlock(blocks.StructBlock):
    """Pull quote with attribution."""

    quote = blocks.TextBlock()
    attribution = blocks.CharBlock(required=False, help_text="Who said it?")

    class Meta:
        icon = "openquote"
        template = "blog/blocks/quote.html"


class CodeBlock(blocks.StructBlock):
    """Code snippet with language flag for syntax highlighting classes."""

    language = blocks.CharBlock(
        required=False,
        help_text="Language hint, e.g. python, js, bash. Used as a CSS class.",
    )
    code = blocks.TextBlock(rows=10, help_text="Paste code; rendered inside <pre><code>.")

    class Meta:
        icon = "code"
        template = "blog/blocks/code_block.html"


class HeroSectionBlock(blocks.StructBlock):
    """Large hero for the top of a post."""

    eyebrow = blocks.CharBlock(required=False, help_text="Small label above the title.")
    title = blocks.CharBlock()
    subtitle = blocks.RichTextBlock(required=False, features=["bold", "italic", "link"])
    background_image = ImageChooserBlock(required=False)
    button_text = blocks.CharBlock(required=False)
    button_url = blocks.URLBlock(required=False)

    class Meta:
        icon = "pick"
        template = "blog/blocks/hero.html"


class TwoColumnBlock(blocks.StructBlock):
    """Simple text + media two-column layout with optional inversion."""

    left_content = blocks.RichTextBlock(
        features=["h2", "h3", "bold", "italic", "link", "ol", "ul"]
    )
    right_image = ImageChooserBlock(required=False)
    swap = blocks.BooleanBlock(
        required=False,
        help_text="Place the image on the left and text on the right.",
        default=False,
    )

    class Meta:
        icon = "placeholder"
        template = "blog/blocks/two_column.html"


class FeatureGridBlock(blocks.StructBlock):
    """Grid of feature cards."""

    items = blocks.ListBlock(
        blocks.StructBlock(
            [
                ("icon", blocks.CharBlock(required=False, help_text="Emoji or icon class.")),
                ("title", blocks.CharBlock()),
                ("text", blocks.TextBlock()),
            ]
        ),
        help_text="Add 3–6 concise features.",
    )

    class Meta:
        icon = "form"
        template = "blog/blocks/feature_grid.html"


class CalloutBlock(blocks.StructBlock):
    """Note / alert style callout."""

    kind = blocks.ChoiceBlock(
        choices=[("info", "Info"), ("success", "Success"), ("warning", "Warning")],
        default="info",
    )
    title = blocks.CharBlock(required=False)
    body = blocks.RichTextBlock(features=["bold", "italic", "link", "ol", "ul"])

    class Meta:
        icon = "warning"
        template = "blog/blocks/callout.html"


class CallToActionBlock(blocks.StructBlock):
    """Inline CTA card for the article body."""

    headline = blocks.CharBlock()
    text = blocks.TextBlock(required=False)
    button_label = blocks.CharBlock()
    button_url = blocks.URLBlock()

    class Meta:
        icon = "plus"
        template = "blog/blocks/cta.html"


class SimpleLinkCTABlock(blocks.StructBlock):
    """Backwards-compatible simple CTA (label + URL)."""

    label = blocks.CharBlock()
    url = blocks.URLBlock()

    class Meta:
        icon = "link"
        template = "blog/blocks/simple_cta.html"


class DividerBlock(blocks.StaticBlock):
    """Thin horizontal separator."""

    class Meta:
        icon = "horizontalrule"
        template = "blog/blocks/divider.html"


class ImageBlock(blocks.StructBlock):
    """Single image with caption + alignment."""

    image = ImageChooserBlock()
    caption = blocks.CharBlock(required=False)
    alignment = blocks.ChoiceBlock(
        choices=[
            ("left", "Left"),
            ("center", "Center"),
            ("right", "Right"),
            ("full", "Full width"),
        ],
        default="center",
    )

    class Meta:
        icon = "image"
        template = "blog/blocks/image.html"


class ImageGalleryBlock(blocks.ListBlock):
    """Responsive gallery of images."""

    def __init__(self, **kwargs):
        super().__init__(
            blocks.StructBlock(
                [
                    ("image", ImageChooserBlock()),
                    ("caption", blocks.CharBlock(required=False)),
                ]
            ),
            **kwargs,
        )

    class Meta:
        icon = "image"
        template = "blog/blocks/gallery.html"


class VideoEmbedBlock(EmbedBlock):
    """Responsive video embed."""

    class Meta:
        icon = "media"
        template = "blog/blocks/video_embed.html"


class RawHTMLBlock(blocks.RawHTMLBlock):
    """Dangerous raw HTML (for trusted embeds)."""

    class Meta:
        icon = "code"
        template = "blog/blocks/raw_html.html"


class TableOfContentsBlock(blocks.StructBlock):
    """TOC that can auto-generate from headings, with optional manual overrides."""

    auto = blocks.BooleanBlock(
        required=False,
        default=True,
        help_text="Auto-generate from H2/H3 in the article body.",
    )
    manual_items = blocks.ListBlock(
        blocks.StructBlock(
            [
                ("label", blocks.CharBlock()),
                ("anchor_id", blocks.CharBlock(help_text="Matches the heading anchor ID")),
            ]
        ),
        required=False,
        help_text="Optional manual overrides. Leave empty to auto-build.",
    )

    class Meta:
        icon = "list-ul"
        template = "blog/blocks/table_of_contents.html"


class FAQBlock(blocks.StructBlock):
    """Frequently asked questions."""

    items = blocks.ListBlock(
        blocks.StructBlock(
            [
                ("question", blocks.CharBlock()),
                ("answer", blocks.RichTextBlock(features=["bold", "italic", "link", "ol", "ul"])),
            ]
        )
    )

    class Meta:
        icon = "help"
        template = "blog/blocks/faq.html"


class AccordionBlock(blocks.StructBlock):
    """Collapsible accordion sections."""

    items = blocks.ListBlock(
        blocks.StructBlock(
            [
                ("title", blocks.CharBlock()),
                ("content", blocks.RichTextBlock(features=["bold", "italic", "link", "ol", "ul"])),
            ]
        )
    )

    class Meta:
        icon = "list-ol"
        template = "blog/blocks/accordion.html"


class CTAFromSnippetBlock(blocks.StructBlock):
    """Drop a reusable CTA snippet into the stream."""

    snippet = SnippetChooserBlock("blog.CallToActionSnippet")

    class Meta:
        icon = "snippet"
        template = "blog/blocks/cta_snippet.html"
