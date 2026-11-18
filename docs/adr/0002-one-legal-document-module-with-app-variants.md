# 2. One legal-document module, with each app as a variant

Date: 2026-11-18
Status: Accepted (issue #16)

## Context

Each app has a privacy policy and terms of use at URLs registered with the app
stores: `/privacy-policy.html` and `/terms-of-use.html` (NutriMax),
`/minesweeper/privacy-policy.html` and `/minesweeper/terms-of-use.html`. The
Minesweeper documents started as copies of the NutriMax ones, so the controller
block, user rights, contact and response-time wording and most of the terms'
clauses were written twice and had started to drift. A GDPR fix had to be made in
two places. The two apps really do differ in what data they collect, which third
parties they use, their minimum age, their effective dates, and some clauses
(NutriMax has accounts and a health disclaimer; Minesweeper is offline, free and
for all ages).

## Decision

Build the four pages from shared Jekyll includes plus per-app facts and sections
(ADR 0001 already gives us Jekyll):

- **App facts**: `_data/apps/<app>.yml`, small and factual: name, `min_age` (none
  for an all-ages app), `accounts`, `personal_data`, `free`, the website path, the
  Delete account page, and the effective date of each document.
- **Shared sections**: `_includes/legal/privacy/<id>.html` and
  `_includes/legal/terms/<id>.html`, with their headings in `_data/legal.yml`.
  They render app facts (`{{ legal_app.name }}`, `{{ legal_app.min_age }}`) and
  switch on them where the wording legitimately differs (`accounts`, `free`,
  `personal_data`). Shared paragraphs that sit inside an app's own section (app
  stores, licence grant, survival clause, personal-use clause, contact block) are
  in `_includes/legal/snippets/`.
- **The app's own sections**: `_includes/legal/<app>/privacy/<id>.html` and
  `_includes/legal/<app>/terms/<id>.html` (what NutriMax collects, Shared Meals,
  Minesweeper's donations, ...). A few shared sections start with an app part at
  the same path (`privacy/intro`, `privacy/international-transfers`,
  `terms/third-party`).
- **Pages stay where they are** and become thin: front matter with
  `layout: null`, `app: <app>` and the ordered list of sections (a shared one by
  id, the app's own as `{id, title}`), then the page's own head, styles and
  footer around `{% include legal/privacy-policy.html %}` or
  `{% include legal/terms-of-use.html %}`. Those includes render the title,
  effective date, table of contents and numbered sections;
  `{% include legal/ref.html id="..." %}` renders "Section N" cross-references
  from the same list, so reordering sections can't break them.
- Only wording that is (or should be) the same for both apps is shared. Where the
  copies had drifted, we kept the better wording for both; the commit that made
  this change lists each one.

## Alternatives considered

- **One template per document with `if app == ...` branches.** Fewer files, but
  every app's prose would sit in one file and a third app would touch every
  branch.
- **All prose in YAML** (sections as data). One file per app, but long legal text
  with links and markup in YAML strings is hard to edit and review.
- **Jekyll layouts** (`layout: legal`). The pages keep different heads, styles and
  footers until issue #15, and ADR 0001 has every page use `layout: null`; a layout
  can come with #15.

## Consequences

- To change shared wording, edit `_includes/legal/`; to change an app's wording,
  edit `_includes/legal/<app>/` or its app facts. The pages hold only structure,
  head and footer.
- A third app needs an app-facts file, its own sections and two thin pages (see
  the README).
- Mistakes fail the build: an unknown app, section or cross-reference includes a
  file that doesn't exist (for example `legal/no-section-on-this-page/<id>.html`),
  and Jekyll stops with that name.
- `tools/check-site.mjs` can no longer compare these pages to their own source
  (check 4 skips pages that use includes). Instead it checks that each app's two
  documents exist and state the minimum age from its app facts, that the shared
  wording occurs in exactly one source file and in every page that should have
  it, and that every page is well-formed, has unique ids and has no broken
  internal links or anchors.
