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
