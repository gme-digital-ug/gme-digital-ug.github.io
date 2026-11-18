# GME Digital UG website

Static GitHub Pages site served at `share.gmedigital.de` (see `CNAME`). There's no build step: every file in the repo is published exactly as committed, this one included. Pushing to `main` deploys.

## Load-bearing files and URLs

- `.nojekyll` keeps `.well-known/` published. `.well-known/assetlinks.json` verifies Android App Links for the Shared Meal landing page (`/m/`). Its package name `com.gmedigital.nutriflow` is NutriMax's permanent pre-rebrand ID, so leave it as is.
- These URLs are registered with the app stores and must keep resolving: `/privacy-policy.html` and `/terms-of-use.html` (NutriMax, at the root) and `/nutrimax/delete-account.html`.
- `m/index.html` has a strict CSP: inline styles and scripts only.
- `impressum.html` and `datenschutz.html` are the German legal pages. Every page should link to both.

## Company facts

Company name, address, HRB, managing director, contact email (`main@gmedigital.de`) and site origin are hand-copied across pages until issues #13/#14 land. When changing one, search every `*.html` and update every copy.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
