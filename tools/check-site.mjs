#!/usr/bin/env node
// Checks a built site (_site) against its source. No dependencies; Node 18+.
//
//   node tools/check-site.mjs --source DIR --site DIR [--baseline DIR]
//
// --source    the repo as committed (LF line endings), e.g. a git export or a CI checkout
// --site      the Jekyll output built from it by GitHub's Pages build
// --baseline  optional: an export of the site from before a migration (for example
//             `git archive c638435`). Every HTML page in it must come out of the new
//             build byte-identical, apart from the AGREED_CORRECTIONS listed below.
//
// Exits 1 and lists every failure if anything is off.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------- configuration

// URLs that are registered elsewhere (app stores, Search Console, App Links) or
// linked from outside; each must exist in the built site.
const REQUIRED_PATHS = [
  'index.html',
  'impressum.html',
  'datenschutz.html',
  'privacy-policy.html',
  'terms-of-use.html',
  'nutrimax/index.html',
  'nutrimax/delete-account.html',
  'nutrimax/assets/delete_1.png',
  'nutrimax/assets/delete_2.png',
  'nutrimax/assets/delete_3.png',
  'nutrimax/assets/delete_4.png',
  'minesweeper/index.html',
  'minesweeper/privacy-policy.html',
  'minesweeper/terms-of-use.html',
  'm/index.html',
  'assets/css/site.css',
  'google4b2bd9d1f918206f.html',
  '.well-known/assetlinks.json',
  'CNAME',
];

// Repo files that must never be published (mirrors `exclude` in _config.yml).
const INTERNAL = [
  'CLAUDE.md', 'README.md', 'GLOSSARY.md', 'HANDOFF.md', 'Gemfile', 'Gemfile.lock',
  'docs/', 'tools/', '.github/', '_config.yml', '_data/', '.gitignore', '.nojekyll',
];

// Pages already moved to the Company facts source ('*' = every HTML page): their
// source must not hand-type a Company fact, and every fact they show must match.
const MIGRATED_PAGES = ['*'];

// Fixes to the pre-migration pages that the migration makes on purpose. Each
// entry: page, the old text, the new text, and why. Only used with --baseline.
const RETIRED_GMAIL = {
  from: 'main.gme.digital@gmail.com',
  to: 'main@gmedigital.de',
  why: 'Retired Gmail address; main@gmedigital.de is the contact email in the Impressum (issue #14).',
};
const AGREED_CORRECTIONS = [
  { page: 'privacy-policy.html', ...RETIRED_GMAIL },
  { page: 'nutrimax/delete-account.html', ...RETIRED_GMAIL },
];

// The page shell (docs/adr/0003): one stylesheet and one legal footer on every page.
const SHELL = {
  css: '_includes/shell/site.css',         // the one source of the shared CSS,
  stylesheet: 'assets/css/site.css',       // published from it for every page,
  inlined: ['m/index.html'],               // except these, which inline it (their CSP allows no request)
  exempt: ['google4b2bd9d1f918206f.html'], // Search Console verification file: not a page, left as is
  // Tokens the shell defines and pages only use.
  tokens: ['--text', '--muted', '--bg', '--surface', '--border', '--radius', '--font',
    '--accent', '--accent-strong', '--accent-soft', '--accent-bright', '--accent-gradient'],
  // Whose legal documents a page's footer links, by path prefix (legal documents:
  // the app in their front matter). Every other page is the company's own; its
  // footer links every app's documents.
  appOf: [['nutrimax/', 'nutrimax'], ['m/', 'nutrimax'], ['minesweeper/', 'minesweeper']],
};

// The Shared Meal page's Content-Security-Policy, exactly as the owner decided
// (docs/adr/0003). Changing it is a decision, not an edit.
const SHARED_MEAL_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
  "img-src data:; base-uri 'none'; form-action 'none'";

// ---------------------------------------------------------------- helpers

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
if (!args.source || !args.site) {
  console.error('usage: check-site.mjs --source DIR --site DIR [--baseline DIR]');
  process.exit(2);
}

const failures = [];
const fail = (msg) => failures.push(msg);
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) fail(msg); return ok; };

function walk(root, dir = root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(root, full));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}
const read = (root, p) => readFileSync(join(root, p));
const text = (root, p) => read(root, p).toString('utf8');

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const frontMatter = (buf) => {
  const m = buf.toString('utf8').match(FRONT_MATTER);
  return m ? { yaml: m[1], body: buf.toString('utf8').slice(m[0].length) } : null;
};

// Minimal YAML reader for _data/company.yml: nested maps of scalars, 2-space indent.
function parseYaml(src) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of src.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) continue;
    const m = raw.match(/^( *)([\w-]+):\s*(.*)$/);
    if (!m) throw new Error(`company.yml: cannot read line: ${raw}`);
    const [, ind, key, rest] = m;
    while (stack.at(-1).indent >= ind.length) stack.pop();
    const parent = stack.at(-1).obj;
    const value = rest.replace(/\s+#.*$/, '').trim();
    if (value === '') {
      parent[key] = {};
      stack.push({ indent: ind.length, obj: parent[key] });
    } else {
      parent[key] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }
  return root;
}
const leaves = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);

const isInternal = (p) => INTERNAL.some((i) => (i.endsWith('/') ? p.startsWith(i) : p === i));
const isPublic = (p) =>
  !isInternal(p) &&
  !p.split('/').some((seg) => seg.startsWith('_')) &&
  !p.split('/').some((seg) => seg.startsWith('.') && seg !== '.well-known');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The site file a relative href on page p points to ("../impressum.html" on
// "nutrimax/index.html" -> "impressum.html"); p itself for a bare "#fragment".
function resolveHref(p, href) {
  const path = href.split('#')[0];
  if (!path) return p;
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const resolved = [];
  for (const s of (dir + path).split('/')) {
    if (s === '..') resolved.pop(); else if (s !== '.' && s !== '') resolved.push(s);
  }
  return resolved.join('/') + (path.endsWith('/') ? 'index.html' : '');
}

// ---------------------------------------------------------------- checks

const { source, site, baseline } = args;
const srcFiles = walk(source);
const siteFiles = walk(site);
const company = parseYaml(text(source, '_data/company.yml'));
const facts = Object.fromEntries(leaves(company));

// 1. Required URLs exist.
for (const p of REQUIRED_PATHS) check(existsSync(join(site, p)), `missing in site: /${p}`);

// 2. assetlinks.json byte-identical to the source (and to the baseline, if given).
const al = '.well-known/assetlinks.json';
if (existsSync(join(site, al))) {
  check(read(site, al).equals(read(source, al)), `${al} differs from the source`);
  if (baseline) check(read(site, al).equals(read(baseline, al)), `${al} differs from the baseline`);
  try { JSON.parse(text(site, al)); checks++; } catch { fail(`${al} is not valid JSON`); }
}

// 3. The site is exactly the public source files: nothing internal, nothing extra.
const expected = new Set(srcFiles.filter(isPublic));
for (const p of siteFiles) {
  check(expected.has(p), `published but not a public source file: /${p}`);
  check(!isInternal(p), `internal file published: /${p}`);
}
for (const p of expected) check(siteFiles.includes(p), `public source file not published: /${p}`);

// 4. Files without front matter are copied byte for byte; pages with front matter
//    must opt out of layouts and render to their source with only the Liquid
//    output tags replaced.
const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
for (const p of [...expected].filter((p) => siteFiles.includes(p))) {
  const src = read(source, p);
  const fm = frontMatter(src);
  if (!fm) {
    check(read(site, p).equals(src), `/${p} has no front matter but differs from its source`);
    continue;
  }
  check(/^layout:\s*null\s*$/m.test(fm.yaml), `/${p} has front matter without "layout: null"`);
  // Pages assembled from _includes (the legal documents) can't be matched against
  // their own source; checks 9-14 cover them.
  if (/\{%-?\s*include\s/.test(fm.body)) continue;
  const out = text(site, p);
  const pattern = new RegExp(`^${fm.body.split(LIQUID).map(escapeRe).join('[^<>]*?')}$`);
  check(pattern.test(out), `/${p} output differs from its source outside the Liquid tags`);
}

// 5. No Liquid left unrendered in any HTML or CSS output.
const htmlOut = siteFiles.filter((p) => p.endsWith('.html'));
const migrated = MIGRATED_PAGES.includes('*') ? htmlOut : MIGRATED_PAGES;
for (const p of siteFiles.filter((p) => /\.(html|css)$/.test(p))) {
  const out = text(site, p);
  check(!/\{\{|\{%/.test(out), `/${p} contains unrendered Liquid ({{ or {%)`);
}

// 6. Every Company fact a built page names is the value in _data/company.yml.
//    Each detector finds anything that looks like that fact, right or drifted.
//    (Checked on migrated pages.)
const origin = facts.origin;
const detectors = [
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, () => facts.email],
  ['phone', /\+49[\d ]*\d/g, () => facts.phone],
  ['register.number', /HRB\s*\d+\s*[A-Z]?\b/g, () => facts['register.number']],
  ['register.court', /Amtsgericht\s+[\wäöüÄÖÜß-]+/g, () => facts['register.court']],
  ['managing_director', /Gr[iy]gor\w*\s+Gar\w*/g, () => facts.managing_director],
  ['address.street', /[\wäöüÄÖÜß-]+stra(?:ß|ss)e\s+\d+\w?/g, () => facts['address.street']],
  ['address.postcode', /\b\d{5}\s+Berlin\b/g, () => `${facts['address.postcode']} ${facts['address.city']}`],
  ['name', /GME Digital UG\s*\([^)]*\)/g, () => facts.name],
  ['origin', /https?:\/\/[\w.-]*(?:gmedigital|github\.io)[\w.-]*/g, () => origin],
];
for (const p of migrated) {
  const out = text(site, p);
  for (const [fact, re, want] of detectors) {
    for (const [found] of out.matchAll(re)) {
      check(found === want(), `/${p}: ${fact} is "${found}", Company facts say "${want()}"`);
    }
  }
}

// 7. Migrated pages don't hand-type Company facts in their source.
// City and country alone are too common to flag ("the laws of Germany", "courts
// of Berlin"); the postcode and street catch a hand-typed address.
const GENERIC = ['address.city', 'address.country_de', 'address.country_en'];
const handTyped = [
  ...leaves(company).filter(([k]) => !GENERIC.includes(k)),
  ['host', new URL(origin).host],
  ['an email address', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/],
  ['a github.io address', /github\.io/],
];
// Includes and app facts end up in pages too, so they are held to the same rule.
const partials = srcFiles.filter((p) =>
  (p.startsWith('_includes/') && p.endsWith('.html')) || (p.startsWith('_data/') && p !== '_data/company.yml'));
for (const p of [...migrated, ...partials]) {
  const src = text(source, p);
  for (const [fact, value] of handTyped) {
    if (value === 'tbd') continue; // placeholders are not facts yet
    const hit = value instanceof RegExp ? value.test(src) : src.includes(value);
    check(!hit, `${p} hand-types ${fact} (${value}); render it from _data/company.yml`);
  }
}

// 8. Optional: rendered HTML equals the pre-migration baseline, apart from agreed corrections.
if (baseline) {
  for (const p of walk(baseline).filter((p) => p.endsWith('.html') && isPublic(p))) {
    if (!check(existsSync(join(site, p)), `/${p} is in the baseline but not in the site`)) continue;
    let want = text(baseline, p);
    for (const c of AGREED_CORRECTIONS.filter((c) => c.page === p)) {
      check(want.includes(c.from), `correction for ${p} no longer applies: ${c.from}`);
      want = want.split(c.from).join(c.to);
    }
    check(text(site, p) === want, `/${p} differs from the baseline (beyond agreed corrections)`);
  }
}

// 9. Legal documents (pages with `app: <name>` in their front matter, see
//    docs/adr/0002): every app has a privacy policy and terms of use, and both
//    state the minimum age from its app facts (_data/apps/<name>.yml). Every
//    "aged N", "under N", "at least N", "between N" in them must be that age; an
//    app without min_age must say it is for all ages.
const AGE = /\b(?:aged|under|at least|between)\s+(?:<strong>)?(\d{1,2})\b/g;
const legalPages = {}; // app -> { privacy, terms }
for (const p of srcFiles.filter((p) => p.endsWith('.html') && isPublic(p))) {
  const app = frontMatter(read(source, p))?.yaml.match(/^app:\s*([\w-]+)/m)?.[1];
  if (!app) continue;
  const doc = text(source, p).includes('{% include legal/privacy-policy.html %}') ? 'privacy'
    : text(source, p).includes('{% include legal/terms-of-use.html %}') ? 'terms' : null;
  if (!check(doc, `${p} names an app but includes neither legal document`)) continue;
  check(!legalPages[app]?.[doc], `${app} has two ${doc} pages: ${legalPages[app]?.[doc]} and ${p}`);
  (legalPages[app] ??= {})[doc] = p;
}
check(Object.keys(legalPages).length >= 2, 'expected the legal documents of at least NutriMax and Minesweeper');
for (const [app, docs] of Object.entries(legalPages)) {
  const factsFile = `_data/apps/${app}.yml`;
  if (!check(existsSync(join(source, factsFile)), `app ${app} has no app facts ${factsFile}`)) continue;
  const appFacts = parseYaml(text(source, factsFile));
  for (const doc of ['privacy', 'terms']) {
    const p = docs[doc];
    if (!check(p, `app ${app} has no ${doc} page`) || !existsSync(join(site, p))) continue;
    const out = text(site, p);
    check(out.includes(`<p class="subtitle">${appFacts.name} `), `/${p} is not titled for ${appFacts.name}`);
    if (appFacts.min_age) {
      const ages = [...out.matchAll(AGE)].map(([, n]) => n);
      check(ages.length > 0, `/${p} does not state the minimum age ${appFacts.min_age}`);
      for (const n of ages) check(n === appFacts.min_age, `/${p} names age ${n}; ${factsFile} says min_age ${appFacts.min_age}`);
    } else {
      check(/all ages/.test(out), `/${p}: ${factsFile} has no min_age, but the page doesn't say "all ages"`);
    }
  }
}

// 10. The NutriMax account-deletion contract (email, response time, in-app path and
//     timing) is stated only on the Delete account page; the privacy policy's
//     deletion section links there instead of repeating timings or the in-app path.
const DELETION = {
  page: 'nutrimax/delete-account.html',
  states: ['within 5 business days', 'within 30 days', 'takes effect immediately',
    'User Settings', `mailto:${facts.email}`],
  summary: { page: 'privacy-policy.html', section: 'data-retention' },
  notInSummary: [/business days/, /within 30 days/, /Settings/, /→/],
};
const sectionOf = (html, id) => {
  const m = html.match(new RegExp(`<h2 id="${id}">[\\s\\S]*?(?=<h2[ >]|</main>|<footer[ >])`));
  return m ? m[0] : '';
};
if (existsSync(join(site, DELETION.page))) {
  const page = text(site, DELETION.page);
  for (const s of DELETION.states) check(page.includes(s), `/${DELETION.page} does not state "${s}"`);
}
if (existsSync(join(site, DELETION.summary.page))) {
  const sec = sectionOf(text(site, DELETION.summary.page), DELETION.summary.section);
  check(sec !== '', `/${DELETION.summary.page} has no #${DELETION.summary.section} section`);
  check(sec.includes(`href="${DELETION.page}"`) || sec.includes(`href="./${DELETION.page}"`),
    `/${DELETION.summary.page}#${DELETION.summary.section} does not link to /${DELETION.page}`);
  for (const re of DELETION.notInSummary) {
    check(!re.test(sec), `/${DELETION.summary.page}#${DELETION.summary.section} restates the deletion contract (${re})`);
  }
}

// 11. Shared legal wording is written once (docs/adr/0002): each of these phrases
//     occurs in exactly one source file, and in every built legal page of its kind
//     (except the "ifFacts" ones, which only apps with those app facts get).
const SHARED_WORDING = {
  privacy: [
    'The data controller responsible for processing your personal data',
    'is not required to appoint a Data Protection Officer',
    'Depending on your country of residence, you may have the following rights',
    'We will respond within 30 days (GDPR) or 45 days (CCPA)',
    'lodge a complaint with your local data protection authority',
    'We may update this Privacy Policy from time to time',
    'collects data as part of the download',
  ],
  terms: [
    'Please read these Terms of Use carefully',
    'These Terms of Use govern your access to and use of',
    'Reverse-engineer, decompile, or disassemble',
    'We grant you a limited, non-exclusive, non-transferable, revocable licence',
    'These third parties have their own terms and privacy policies',
    'disclaims all warranties',
    'shall not be liable for any indirect, incidental',
    'Sections that by their nature should survive termination',
    'governed by the laws of the Federal Republic of Germany',
    'We may update these Terms of Use from time to time',
  ],
  both: ['We aim to respond to all'],
  ifFacts: ['Where personal data is transferred outside the EU/EEA'],
};
const flat = (s) => s.replace(/\s+/g, ' ');
const sources = srcFiles.filter((p) => /\.(html|ya?ml)$/.test(p) && !isInternal(p))
  .map((p) => [p, flat(text(source, p))]);
for (const [kind, phrases] of Object.entries(SHARED_WORDING)) {
  const pages = Object.values(legalPages).flatMap((d) => (kind === 'both' ? [d.privacy, d.terms] : [d[kind]]))
    .filter((p) => p && existsSync(join(site, p)));
  for (const phrase of phrases) {
    const inSource = sources.filter(([, t]) => t.includes(phrase)).map(([p]) => p);
    check(inSource.length === 1, `"${phrase}" should be written once, found in: ${inSource.join(', ') || 'no source file'}`);
    for (const p of pages) check(flat(text(site, p)).includes(phrase), `/${p} lacks the shared wording "${phrase}"`);
  }
}

// 12-14. Every built HTML page is well-formed (each non-void element closed, in
//     order), has unique ids, and every link to a fragment or a site file resolves.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'track', 'wbr']);
const idsOf = (html) => [...html.matchAll(/\sid="([^"]*)"/g)].map(([, id]) => id);
for (const p of htmlOut) {
  const html = text(site, p);
  const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
  const stack = [];
  let wellFormed = true;
  for (const [, close, name, selfClosing] of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const tag = name.toLowerCase();
    if (VOID.has(tag) || selfClosing) continue;
    if (!close) { stack.push(tag); continue; }
    if (stack.at(-1) === tag) { stack.pop(); continue; }
    wellFormed = false;
    fail(`/${p}: </${tag}> closes <${stack.at(-1) ?? 'nothing'}>`);
    break;
  }
  check(wellFormed && stack.length === 0, `/${p} is not well-formed (unclosed: ${stack.join(' > ')})`);

  const ids = idsOf(html);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(dupes.length === 0, `/${p} has duplicate ids: ${[...new Set(dupes)].join(', ')}`);

  for (const [, href] of html.matchAll(/\shref="([^"]*)"/g)) {
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue; // mailto:, https:, intent:, ...
    const [path, frag] = href.split('#');
    const target = resolveHref(p, href);
    if (path && !check(siteFiles.includes(target), `/${p} links to ${href}, which is not in the site`)) continue;
    if (frag && target.endsWith('.html')) {
      check(idsOf(text(site, target)).includes(frag), `/${p} links to ${href}, but /${target} has no id "${frag}"`);
    }
  }
}

// 15. The page shell (docs/adr/0003). The shared CSS has one source, published
//     unchanged as the stylesheet; it defines the shared tokens and the accents.
const lf = (s) => s.replace(/\r\n/g, '\n');
const shellCss = existsSync(join(source, SHELL.css)) ? lf(text(source, SHELL.css)).trim() : '';
check(shellCss !== '', `${SHELL.css} (the shared CSS) is missing`);
if (existsSync(join(site, SHELL.stylesheet))) {
  check(lf(text(site, SHELL.stylesheet)).trim() === shellCss, `/${SHELL.stylesheet} is not ${SHELL.css} as it is`);
}
const shellDefines = new Set([...shellCss.matchAll(/(--[\w-]+)\s*:/g)].map(([, t]) => t));
for (const t of SHELL.tokens) check(shellDefines.has(t), `${SHELL.css} does not define ${t}`);
const accents = new Set([...shellCss.matchAll(/\[data-accent="([\w-]+)"\]/g)].map(([, a]) => a));

// 16. Every page uses the shell: it links the stylesheet (or inlines it, if listed),
//     picks a defined accent, and doesn't define tokens or base rules itself.
const appOfPage = (p) =>
  Object.entries(legalPages).find(([, d]) => d.privacy === p || d.terms === p)?.[0] ??
  SHELL.appOf.find(([prefix]) => p.startsWith(prefix))?.[1];
const shellPages = htmlOut.filter((p) => !SHELL.exempt.includes(p));
for (const p of shellPages) {
  const html = text(site, p);
  const sheets = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)]
    .map(([tag]) => resolveHref(p, tag.match(/\shref="([^"]*)"/)?.[1] ?? ''));
  if (SHELL.inlined.includes(p)) {
    check(shellCss && lf(html).includes(shellCss), `/${p} does not inline ${SHELL.css} in a <style> element`);
  } else {
    check(sheets.includes(SHELL.stylesheet), `/${p} does not link the shared stylesheet /${SHELL.stylesheet}`);
  }
  const accent = html.match(/<html\b[^>]*\sdata-accent="([^"]*)"/)?.[1];
  check(accents.has(accent), `/${p} picks no accent defined in ${SHELL.css} (<html data-accent="${accent ?? ''}">)`);

  // The page's own CSS: its <style> elements in the source (an included shell is not its own).
  const own = existsSync(join(source, p)) ? [...text(source, p).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map(([, css]) => css.replace(/\{%-?\s*include\s+shell\/site\.css\s*-?%\}/, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n') : '';
  for (const [, t] of own.matchAll(/(--[\w-]+)\s*:/g)) {
    check(false, `${p} defines the CSS variable ${t}; tokens and accents live in ${SHELL.css}`);
  }
  for (const t of new Set([...own.matchAll(/var\((--[\w-]+)/g)].map(([, t]) => t))) {
    check(shellDefines.has(t), `${p} uses ${t}, which ${SHELL.css} does not define`);
  }
  for (const [rule, re] of [['the base font', /font-family\s*:/], ['the box-sizing reset', /box-sizing\s*:/],
    ['the footer', /(?:^|[\s,}])(?:footer|\.site-footer[\w-]*|\.footer)\b[^{;]*\{/m]]) {
    check(!re.test(own), `${p} styles ${rule} itself; that belongs to ${SHELL.css}`);
  }
}

// 17. Every page has the one legal footer (_includes/shell/footer.html): relative
//     links to the Impressum and the Datenschutzerklärung, to the privacy policy and
//     terms of use of the page's own app (a company page: of every app) and of no
//     other app, and the company's name.
for (const p of shellPages) {
  const html = text(site, p);
  const footers = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/g)].map(([f]) => f);
  if (!check(footers.length === 1 && /^<footer class="site-footer\b/.test(footers[0] ?? ''),
    `/${p} should have exactly one shared footer (<footer class="site-footer">), has ${footers.length} footer(s)`)) continue;
  const hrefs = [...footers[0].matchAll(/\shref="([^"]*)"/g)].map(([, h]) => h);
  for (const h of hrefs) check(!/^(?:[a-z]+:|\/)/i.test(h), `/${p}: footer link ${h} is not relative`);
  const links = hrefs.map((h) => resolveHref(p, h));
  for (const want of ['impressum.html', 'datenschutz.html']) {
    check(links.includes(want), `/${p}: footer does not link /${want}`);
  }
  const app = appOfPage(p);
  for (const [a, docs] of Object.entries(legalPages)) {
    for (const doc of [docs.privacy, docs.terms].filter(Boolean)) {
      if (!app || app === a) check(links.includes(doc), `/${p}: footer does not link /${doc} (${a})`);
      else check(!links.includes(doc), `/${p}: footer links /${doc} of ${a}, but the page is ${app}'s`);
    }
  }
  check(footers[0].includes(facts.name), `/${p}: footer does not name ${facts.name}`);
}

// 18. The Shared Meal page (and any page that inlines the shell) makes no request
//     and reads nothing from the address: its CSP is exactly the agreed one, no
//     element loads anything (only <a> has an href), its CSS loads nothing, and its
//     scripts are inline and don't touch the address or the network.
for (const p of SHELL.inlined.filter((p) => existsSync(join(site, p)))) {
  const html = text(site, p);
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i)?.[1];
  check(csp === SHARED_MEAL_CSP, `/${p}: Content-Security-Policy changed to "${csp}"`);
  check(/<meta name="referrer" content="no-referrer">/.test(html), `/${p} lost <meta name="referrer" content="no-referrer">`);
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [what, re] of [
    ['a <link> element', /<link\b/i], ['a <base> element', /<base\b/i],
    ['an attribute that loads a resource', /\s(?:src|srcset|poster|background|data|action|formaction|ping|manifest|xlink:href)\s*=/i],
    ['a meta refresh', /http-equiv="refresh"/i], ['a CSS url()', /url\s*\(/i], ['a CSS @import', /@import/i],
  ]) check(!re.test(markup), `/${p} has ${what}, which would make a request`);
  for (const [, tag] of markup.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*\shref\s*=/g)) {
    check(tag.toLowerCase() === 'a', `/${p}: <${tag}> has an href, which may load a resource`);
  }
  const scripts = [...markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, js]) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n');
  const reads = /\b(?:location|URL|documentURI|baseURI|referrer|history|fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|Image|Worker|import)\b/;
  check(!reads.test(scripts), `/${p}: a script reads the address or makes a request (${scripts.match(reads)?.[0]})`);
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error(`check-site: ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`check-site: all ${checks} checks passed (${siteFiles.length} files${baseline ? ', baseline compared' : ''})`);
