# GME Digital UG website

Static GitHub Pages site served at `share.gmedigital.de` (see `CNAME`). Pushing to `main` deploys: GitHub Pages builds it with its built-in Jekyll (ADR 0001). Pages without front matter are published as committed; pages with front matter (always `layout: null`) are rendered with Liquid first, so a literal `{{`/`{%` in them needs `{% raw %}`. Repo-only files are listed under `exclude` in `_config.yml` and are not published; add new ones there.

## Load-bearing files and URLs

- `_config.yml` keeps `.well-known/` published (`include`). `.well-known/assetlinks.json` verifies Android App Links for the Shared Meal landing page (`/m/`). Its package name `com.gmedigital.nutriflow` is NutriMax's permanent pre-rebrand ID, so leave it as is.
- These URLs are registered with the app stores and must keep resolving: `/privacy-policy.html` and `/terms-of-use.html` (NutriMax, at the root), `/nutrimax/delete-account.html`, and `/minesweeper/privacy-policy.html` and `/minesweeper/terms-of-use.html`.
- `m/index.html` has a strict CSP: inline styles and scripts only.
- `impressum.html` and `datenschutz.html` are the German legal pages. Every page should link to both.

## Company facts

Company name, address, register entry, managing director, contact email, phone, VAT ID and site origin live only in `_data/company.yml`; pages render them as `{{ site.data.company.<key> }}`. Pages still hand-typing them: every page except `impressum.html` (until #14 lands).

Check a change with `tools/build-site.sh` (Docker; GitHub's own Pages build + `tools/check-site.mjs`). See `README.md`.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
