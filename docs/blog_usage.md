# InsightPilot Blog – Quick Guide

This project uses Wagtail as a page-builder style blog. Everything lives in the Wagtail admin at `/cms/`.

## Login
- Visit `/cms/` and sign in with your Django superuser.

## Create the Blog index (one-time)
1) In the left sidebar go to **Pages** and click the root site.
2) Click **Add child page** → choose **Blog index page**.
3) Set **Title** (e.g., “Blog”) and **Slug** (e.g., `blog`), optionally add an intro.
4) Publish. The blog listing will be at `/blog/`.

## Create a Blog post
1) In **Pages**, click your **Blog** index → **Add child page** → **Blog post page**.
2) Fill metadata at the top:
   - Post date, Author name (optional), Hero image, OG image (for social), Excerpt.
   - Categories (snippet) and Tags (free-form).
3) Add body blocks (click the teal “+”):
   - **Hero**: large heading with optional background image + button.
   - **Table of contents**: auto-builds from H2/H3, or add manual anchors.
   - **Heading / Paragraph**: standard content.
   - **Quote**, **Callout** (info/success/warning).
   - **Code** (with language), **Table**, **Divider**.
   - **Image**, **Image gallery**, **Video/Embed**, **Raw HTML** (trusted embeds).
   - **Two column** (text + image with optional swap), **Feature grid**.
   - **CTA** (inline card) or **CTA snippet** (reusable snippet chooser).
   - **FAQ** and **Accordion** blocks.
4) SEO tab:
   - `seo_title`, `search_description`, `focus_keyword`, `canonical_url`, `og_image`.
5) Publish. The post appears under `/blog/<slug>/` and on the index.

## Categories, tags, snippets
- **Categories**: Manage in **Snippets → Blog categories** (name, slug, optional color/icon). Assign on posts; index can filter by `?category=slug`.
- **Tags**: Add on the post edit form; filter via `?tag=<slug>`.
- **CTA snippets**: Create in **Snippets → Call to actions**. Use the **CTA snippet** block to drop them into posts.

## Using blocks
- **TOC**: Insert the **Table of contents** block; it auto-collects H2/H3 anchors, or you can add manual items.
- **Galleries**: Add the **Image gallery** block and upload multiple images with captions.
- **Code**: Set the language field to output a CSS class like `language-python`.
- **Callouts**: Pick kind (info/success/warning) for the colored accent.

## What the templates include
- Modern SaaS-style layout, responsive on desktop/mobile.
- Blog index with search, category/tag filters, pagination.
- Post template with meta badges, read-time, category/tag chips, and OG/Twitter/JSON-LD metadata.

## Checklist
- Blog index created and published at `/blog/`.
- Each post published under the Blog index.
- Set `seo_title`, `search_description`, `focus_keyword` (optional), `canonical_url` (optional), and `og_image` (or hero image) for best SEO/social previews.
