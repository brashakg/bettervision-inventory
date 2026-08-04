# Boost 8.1.0 speed & SEO patches (2026-08-04)

Patched copies of three files from the **live** theme
"Boost 8.1.0 + CTA + Uniform Tiles (2026-07-29)" (theme id 161642283257).
Each file is the full live-theme content with a small, clearly-marked
`BV PATCH` block added, so they can be pasted wholesale over the
corresponding file in a **duplicate** of the live theme.

The Shopify API blocks edits to the published theme, so the workflow is:

1. In Shopify admin: **Online Store → Themes → (live theme) → ⋯ → Duplicate**.
2. Paste each file below over the same path in the duplicate
   (or ask the bv assistant to apply them via API — writes to
   unpublished themes are allowed).
3. Preview the duplicate, then **Publish**.

| File | What the patch does |
| ---- | ------------------- |
| `layout/theme.liquid` | Homepage-only `<title>` override (keyword-rich instead of bare "Better Vision") + `Organization` and `WebSite` JSON-LD on the homepage. |
| `snippets/head-tag.liquid` | Homepage-only meta-description override (the Preferences value is ~300 chars and gets truncated in Google). |
| `snippets/responsive-image.liquid` | Native `loading="lazy"` + `decoding="async"` on all theme images as defense-in-depth alongside lazysizes, incl. the `<noscript>` fallback; optional `loading: 'eager'` param for above-the-fold callers. |

If the homepage title/description is later maintained via
**Online Store → Preferences** instead, delete the two `BV PATCH`
blocks in `theme.liquid` / `head-tag.liquid` — the overrides win over
Preferences while present.
