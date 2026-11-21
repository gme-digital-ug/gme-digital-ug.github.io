# 3. One page shell: a shared stylesheet and legal footer, inlined into the Shared Meal page

Date: 2026-11-18
Status: Accepted (issue #15); amended 2026-11-18 (Minesweeper removed, see the end)

## Context

Every page carried its own copy of the design tokens, the base styles and the footer,
and the copies had drifted: Minesweeper's neutrals were slate instead of gray, the
NutriMax legal documents used a Material green (`#4CAF50`) that NutriMax uses nowhere
else, the footers linked different things (no Terms on the homepage, no
Datenschutzerklärung on the NutriMax and Minesweeper pages), and the Impressum and the
Datenschutzerklärung had no footer and no mobile viewport. German law wants the
Impressum and the Datenschutzerklärung reachable from every page.

The Shared Meal page (`/m/`) is the exception to everything: its
Content-Security-Policy (`default-src 'none'; style-src 'unsafe-inline'; ...`) forbids
every request, so it can't load a shared stylesheet, and it must never read the
address (the share token is in the fragment).

## Decision

- **One CSS source**, `_includes/shell/site.css`: the tokens, one accent block per
  product, an opt-in dark scheme, the base styles, the document styles
  (`<main class="doc">`: legal documents, Impressum, Datenschutz) and the footer
  styles. It is published as `/assets/css/site.css` by a page that only includes it,
  and every page links that.
- **Accents by attribute:** a page names its product, `<html data-accent="nutrimax">`,
  and uses `--accent`, `--accent-strong`, `--accent-soft`, `--accent-bright` and
  `--accent-gradient`. Pages define no CSS variables; each product's colours exist
  once. Canonical values are the homepage's (GME) for the neutrals and each
  product's landing page for its accent.
- **One footer include**, `_includes/shell/footer.html`, on every page. It links the
  home page, the Impressum and the Datenschutzerklärung; a product page (`app=`) also
  links its app's page, privacy policy, terms of use and Delete account page, taken
  from the app facts (`_data/apps/<app>.yml`, `pages:`). The company's own pages
  (home, Impressum, Datenschutz) link every app's documents, named by app: the root
  `/privacy-policy.html` is NutriMax's, not the website's, so an unlabelled "Privacy
  Policy" link on the homepage would mislead. Links are computed relative to the
  page (`_includes/shell/root.html`), so the site works from any host.
- **The Shared Meal page keeps its CSP unchanged** (owner decision). Jekyll inlines
  the same CSS source into a `<style>` element and the footer markup into the page at
  build time. It opts into the shared dark scheme (`data-color-scheme="auto"`), which
  no other page uses yet.
- `tools/check-site.mjs` enforces it: the stylesheet is the source unchanged; every
  page except the Search Console verification file links (or, for `/m/`, inlines) it,
  picks a defined accent, defines no CSS variable, font, reset or footer style of its
  own, and has exactly one shared footer whose relative links reach the Impressum,
  the Datenschutzerklärung and its own app's documents, and no other app's. For
  `/m/` it pins the exact CSP and fails on any element, attribute or CSS that would
  load something, and on scripts that touch the address or the network.

## Alternatives considered

- **Widen `/m/`'s CSP** to `style-src 'self'` and link the stylesheet. One less
  special case, but it adds a request to the one page that promises none, and the
  page would render unstyled if the stylesheet failed. Rejected by the owner.
- **Leave `/m/` outside the shell** with its own styles. Keeps it untouched, but its
  footer and tokens would start drifting again, and it would still need the legal
  links.
- **A Jekyll layout** (`layout: shell`) instead of includes. Pages differ a lot in
  their heads and page-local CSS, and ADR 0001 has every page set `layout: null`;
  two includes (stylesheet, footer) are less to learn than a layout with slots.
- **Sass** (`.scss` with `@import`) for the shared CSS. GitHub Pages supports it,
  but the inlined copy in `/m/` would then need the Sass output, not a plain
  include; plain CSS custom properties are enough for a handful of tokens.
- **Accent per page** (`:root { --accent: ... }` in each page). Simpler to read in
  one file, but five NutriMax pages would repeat the same colours, which is how they
  drifted in the first place.

## Consequences

- Change a token, an accent or the footer in one file; every page follows.
- Shared CSS reaches every page, `/m/` included, so it styles classes only, never
  bare elements (`nav`, `section`, `footer`); page-local CSS is for the page's own
  layout (nav, hero, grids). The NutriMax and Minesweeper landing pages still carry
  near-identical component CSS (buttons, store buttons, feature cards); moving it
  into the shell would need class-scoped selectors first.
- `/m/` grows by the size of the shared CSS (a few KB inline) and is rebuilt
  whenever the shell changes.
- The Impressum and the Datenschutzerklärung now look like the legal documents
  (document styles, GME accent) and have a mobile viewport.
- The copyright year in the footer is the build year.

## Update 2026-11-18: Minesweeper removed

Minesweeper was delisted from the app stores and removed from the site on 2026-11-18,
with its accent block in the shared CSS. The company's own pages now link only
NutriMax's documents in their footer, and only the NutriMax landing page carries the
landing-page component CSS mentioned above.

## Update 2026-11-18: the Shared Meal page keeps its own colours

The Shared Meal page was meant to look the same apart from the footer, but taking the
homepage's gray neutrals and the generic dark scheme had changed its colours. It now
opts into a NutriMax colour scheme in the shared CSS, `data-color-scheme="nutrimax"`:
its original green-tinted neutrals, light and dark, and its original button colours,
with a new accent token `--accent-hover` for hovered fills. The page still defines no
CSS variables. The gray dark scheme (`data-color-scheme="auto"`), which no other page
used, is gone.
