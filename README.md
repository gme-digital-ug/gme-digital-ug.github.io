# gme-digital-ug.github.io

The GME Digital UG website, served at <https://share.gmedigital.de>.

## Deploying

Push to `main`. GitHub Pages ("Deploy from a branch", `main`, root) builds the site
with its built-in Jekyll and publishes it; there is no deploy workflow of our own.
Why Jekyll: [ADR 0001](docs/adr/0001-github-pages-jekyll-for-company-facts.md).

- Pages without front matter are published exactly as committed.
- Pages with front matter (`---` / `layout: null` / `---` at the top) are rendered
  with Liquid first. Always set `layout: null`, or GitHub may wrap the page in a theme.
  A literal `{{` or `{%` in such a page (inline JS or CSS) must go inside
  `{% raw %}…{% endraw %}`.
- `_config.yml` keeps `.well-known/` published (Android App Links) and lists the repo
  files that are not part of the site (`exclude`). Add new internal files there.

## Editing Company facts

The company name, address, commercial register entry, managing director, contact
email, phone, VAT ID and the public site address live in
[`_data/company.yml`](_data/company.yml). Change a value there and every page that
shows it changes on the next deploy. Pages use them like this:

```html
<a href="mailto:{{ site.data.company.email }}">{{ site.data.company.email }}</a>
```

Don't type a Company fact into a page; `tools/check-site.mjs` fails if you do.

## The page shell: one stylesheet, one footer

Every page shares one stylesheet and one legal footer
([ADR 0003](docs/adr/0003-shared-page-shell-inlined-into-the-shared-meal-page.md)):

| What | Where |
| --- | --- |
| Design tokens (`--text`, `--muted`, `--bg`, `--surface`, `--border`, `--radius`, `--font`), base styles, document pages (`<main class="doc">`), footer styles | `_includes/shell/site.css` |
| Each product's accent (`--accent`, `--accent-strong`, `--accent-soft`, `--accent-bright`, `--accent-gradient`) | `_includes/shell/site.css`, one `[data-accent="..."]` block per product |
| The legal footer | `_includes/shell/footer.html` |
| Which pages the footer links for an app | `pages:` and `delete_account` in `_data/apps/<app>.yml` |

`_includes/shell/site.css` is published as `/assets/css/site.css` (through
`assets/css/site.css`, which only includes it). A page uses the shell like this:

```html
<html lang="en" data-accent="nutrimax">
<head>
  ...
  {% include shell/stylesheet.html %}
  <style>/* only this page's own layout: hero, grids, ... */</style>
</head>
<body>
  ...
{% include shell/footer.html app="nutrimax" tone="dark" %}
</body>
```

- **Accent:** a page picks its product's accent with `data-accent` on `<html>`
  (`gme` or `nutrimax`) and uses the accent variables; it never
  defines a CSS variable itself. To change a product's colour, edit its block in
  `site.css`. A new product gets a new block there.
- **Footer:** `app=` names the page's app (a legal document passes `app=page.app`);
  the footer then links that app's page, privacy policy, terms of use and Delete
  account page. The company's own pages (home, Impressum, Datenschutz) leave `app`
  out and link every app's documents. Every footer links the home page, the
  Impressum and the Datenschutzerklärung. `tone="dark"` is the dark footer of the
  product landing pages. Links are relative and work from any folder.
- **Page-local CSS** is for the page's own layout only (nav, hero, grids). Shared
  styles use classes, never bare elements, because they reach every page.
- **The Shared Meal page (`m/index.html`)** may not load a stylesheet: its
  Content-Security-Policy allows no request. It inlines the same file instead,
  `<style>{% include shell/site.css %}</style>`, and opts into the dark scheme with
  `data-color-scheme="auto"`. Don't widen its CSP to link the stylesheet.

`tools/check-site.mjs` checks all of this: every page (except the Search Console
verification file) links the stylesheet (or inlines it), picks a defined accent,
defines no CSS variable, base font, reset or footer style of its own, and has the
one footer with working links to the Impressum, the Datenschutzerklärung and its
app's documents (and no other app's); the Shared Meal page keeps its exact CSP and
makes no request.

## Editing the privacy policies and terms of use

Each app's privacy policy and terms of use are built from one legal-document module
([ADR 0002](docs/adr/0002-one-legal-document-module-with-app-variants.md)):

| What | Where |
| --- | --- |
| Wording shared by every app (controller, rights, transfers, contact, most clauses of the terms) | `_includes/legal/privacy/`, `_includes/legal/terms/`, `_includes/legal/snippets/` |
| Headings of the shared sections | `_data/legal.yml` |
| App facts: name, minimum age, Delete account page, effective dates, ... | `_data/apps/<app>.yml` |
| An app's own sections (what it collects, its third parties, ...) | `_includes/legal/<app>/privacy/`, `_includes/legal/<app>/terms/` |
| Which sections a document has, in which order; head and footer | the page itself (`privacy-policy.html`, `terms-of-use.html`) |

A page lists its sections in its front matter, in order: a shared section by its id,
the app's own as `{id, title}`. Sections are numbered and listed in the table of
contents automatically; refer to one with `{% include legal/ref.html id="consent" %}`
("Section 5", linked) rather than typing its number. When you change a document,
update its effective date in the app facts.

### Adding another app

NutriMax is the only app today; the module is kept so that another app costs an
app-facts file, its own sections and two thin pages.

1. **App facts:** copy `_data/apps/nutrimax.yml` to `_data/apps/<app>.yml` and fill
   it in. `min_age` is required (the shared Eligibility and Children's Privacy
   sections state it).
2. **Shared wording that doesn't fit:** the shared sections are written for an app
   like NutriMax: users have accounts (Your Rights and Changes talk about deleting
   your account and link the app's own `data-retention` section), it processes
   personal data and it isn't free (the liability cap). Where the new app differs,
   add an app fact for the difference and an `{% if %}` on it in the shared section,
   so NutriMax's text stays as it is; where a whole section differs, give the app its
   own section instead.
3. **The app's own sections:** create `_includes/legal/<app>/privacy/` and
   `_includes/legal/<app>/terms/`. Every app needs `privacy/intro.html` (the opening
   paragraphs), `privacy/international-transfers.html` (its part of that section)
   and `terms/third-party.html` (one sentence naming its third parties), plus a file
   for each of its own sections. Use the shared snippets in `_includes/legal/snippets/`
   where they fit (app stores, licence, survival clause, personal use).
4. **Page URLs:** copy `privacy-policy.html` and `terms-of-use.html` to `<app>/`, set
   `app: <app>`, the section list and `data-accent`, and adjust the title and
   description. List the app's pages under
   `pages:` in its app facts (the footer links them) and give it an accent block in
   `_includes/shell/site.css`.
5. **Check:** add both URLs to `REQUIRED_PATHS` in `tools/check-site.mjs` once they are
   registered with the stores, then run `tools/build-site.sh`. It checks that both
   documents exist, state the minimum age from the app facts and contain the shared
   wording.

## Building and checking locally

Needs git, Docker and Node 18+. This builds the working tree (uncommitted changes
included, with the committed LF line endings) in GitHub's own Pages build image and
checks the result:

```sh
tools/build-site.sh            # build into a temp dir and check
tools/build-site.sh _site      # build into ./_site (git-ignored)
tools/build-site.sh _site HEAD  # build a commit instead of the working tree
```

To also compare every page to the site as it was before a change, pass a baseline
export (`git -c core.autocrlf=false archive <commit> | tar -x -C <dir>`):

```sh
tools/build-site.sh _site "" --baseline <dir>
```

Under the hood the build is this Docker command (`SRC` is a git export of the repo,
`OUT` an empty directory):

```sh
docker run --rm \
  -v "$SRC:/github/workspace/src:ro" -v "$OUT:/github/workspace/_site" \
  -e GITHUB_WORKSPACE=/github/workspace -e INPUT_SOURCE=src -e INPUT_DESTINATION=_site \
  -e INPUT_VERBOSE=false -e INPUT_FUTURE=false \
  -e GITHUB_REPOSITORY=gme-digital-ug/gme-digital-ug.github.io \
  ghcr.io/actions/jekyll-build-pages:v1.0.13
node tools/check-site.mjs --source "$SRC" --site "$OUT"
```

The `Site check` workflow (`.github/workflows/site-check.yml`) runs the same build
and check on every pull request and on pushes to branches other than `main`.
