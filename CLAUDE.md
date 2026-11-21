# GME Digital UG website

Static GitHub Pages site served at `share.gmedigital.de` (see `CNAME`). Pushing to `main` deploys: GitHub Pages builds it with its built-in Jekyll (ADR 0001). Pages without front matter are published as committed; pages with front matter (always `layout: null`) are rendered with Liquid first, so a literal `{{`/`{%` in them needs `{% raw %}`. Repo-only files are listed under `exclude` in `_config.yml` and are not published; add new ones there.

## Load-bearing files and URLs

- `_config.yml` keeps `.well-known/` published (`include`). `.well-known/assetlinks.json` verifies Android App Links for the Shared Meal landing page (`/m/`). Its package name `com.gmedigital.nutriflow` is NutriMax's permanent pre-rebrand ID, so leave it as is. `.well-known/apple-app-site-association` does the same for iOS Universal Links; its source of truth is the app repo's `docs/share_site/.well-known/`.
- These URLs are registered with the app stores and must keep resolving: `/privacy-policy.html` and `/terms-of-use.html` (NutriMax, at the root), and `/nutrimax/delete-account.html`.
- `m/index.html` has a strict CSP (inline styles and scripts only, no requests): it inlines the shared CSS instead of linking it. Don't widen the CSP; `tools/check-site.mjs` pins it.
- The two legal documents above (`/privacy-policy.html`, `/terms-of-use.html`) are assembled from `_includes/legal/` and `_data/apps/` (ADR 0002, README): edit wording there, not in the pages.
- `impressum.html` and `datenschutz.html` are the German legal pages. Every page links to both through the shared footer; `tools/check-site.mjs` enforces it.
- Page shell (ADR 0003, README): tokens, accents, base and footer styles live only in `_includes/shell/site.css`; every page uses `_includes/shell/footer.html` and picks its accent with `<html data-accent="...">` (the Shared Meal page also its colour scheme, `data-color-scheme="nutrimax"`). Don't define CSS variables or footer styles in a page.

## Company facts

Company name, address, register entry, managing director, contact email, phone, VAT ID and site origin live only in `_data/company.yml`; pages render them as `{{ site.data.company.<key> }}`. Never type one into a page: `tools/check-site.mjs` fails on hand-typed facts.

Check a change with `tools/build-site.sh` (Docker; GitHub's own Pages build + `tools/check-site.mjs`). See `README.md`.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
