# 1. Share Company facts with GitHub Pages' built-in Jekyll

Date: 2026-11-18
Status: Accepted (issue #13)

## Context

The site is static HTML on GitHub Pages (deploy from branch `main`, custom domain
`share.gmedigital.de`). Until now `.nojekyll` switched the Pages build off, so every
file was published exactly as committed. That was needed to publish
`.well-known/assetlinks.json` (Android App Links for the Shared Meal page `/m/`),
but it meant pages could not share content: the Company facts (name, address,
commercial register entry, managing director, contact email, public site address)
were typed by hand about 20 times across 8 pages and had drifted (the retired Gmail
address, the old github.io host).

## Decision

Use the Jekyll build that GitHub Pages already runs, with no Action-based deploy
and no change to the Pages settings:

- delete `.nojekyll`, add `_config.yml`
- keep `/.well-known/` published with `include: [.well-known]`
- keep the Company facts in one file, `_data/company.yml`; pages render them with
  Liquid, e.g. `{{ site.data.company.email }}`
- a page that uses Liquid gets front matter with `layout: null`; a page without
  front matter is still copied byte for byte

## Alternatives considered

- **A small Node static-site generator, built and deployed by a GitHub Action.**
  Full control over the output, but it adds a toolchain, a deploy workflow and a
  change to the Pages source setting, which is more to own for a handful of pages.
- **Client-side includes** (JavaScript fetching a shared snippet). No build at all,
  but the legal pages would depend on JavaScript and an extra request, crawlers and
  app-store reviewers might not see the facts, and `/m/` forbids network requests
  under its Content-Security-Policy.

## Consequences

- Not every committed file is published any more. Internal files (`CLAUDE.md`,
  `README.md`, `GLOSSARY.md`, `docs/`, `tools/`, `.github/`) are listed under
  `exclude` in `_config.yml`; without that, Pages would render the Markdown files as
  web pages.
- GitHub Pages builds with its default plugins and the default theme. We set
  `theme: null` (otherwise the theme's stylesheet gets published) and give every
  page with front matter `layout: null`, so no page is wrapped in a theme layout.
- In a page with front matter, any `{{` or `{%` is Liquid. Literal ones (in inline
  scripts or styles) must be wrapped in `{% raw %}…{% endraw %}`.
- `.well-known/assetlinks.json` now depends on the `include` line in `_config.yml`.
- Verification: `tools/build-site.sh` builds the site locally in GitHub's own Pages
  build image (Docker) and runs `tools/check-site.mjs`, which checks the output:
  required URLs exist, `assetlinks.json` is byte-identical, no internal file is
  published, pages without front matter are unchanged, no Liquid is left, and every
  Company fact on a migrated page matches `_data/company.yml`. With `--baseline` it
  also compares every page to the pre-migration site. The `Site check` workflow
  runs the same build and check on pull requests and non-`main` branches.
