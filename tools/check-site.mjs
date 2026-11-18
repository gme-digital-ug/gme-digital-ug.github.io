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
  const out = text(site, p);
  const pattern = new RegExp(`^${fm.body.split(LIQUID).map(escapeRe).join('[^<>]*?')}$`);
  check(pattern.test(out), `/${p} output differs from its source outside the Liquid tags`);
}

// 5. No Liquid left unrendered in any HTML output.
const htmlOut = siteFiles.filter((p) => p.endsWith('.html'));
const migrated = MIGRATED_PAGES.includes('*') ? htmlOut : MIGRATED_PAGES;
for (const p of htmlOut) {
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
for (const p of migrated) {
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

// 9. An app's privacy policy and terms of use state one minimum age: every
//    "aged N", "under N", "at least N", "between N" in them names the same N.
const SAME_MIN_AGE = [['privacy-policy.html', 'terms-of-use.html']];
const AGE = /\b(?:aged|under|at least|between)\s+(?:<strong>)?(\d{1,2})\b/g;
for (const pages of SAME_MIN_AGE) {
  const ages = new Set();
  for (const p of pages.filter((p) => existsSync(join(site, p)))) {
    for (const [, n] of text(site, p).matchAll(AGE)) ages.add(n);
  }
  check(ages.size === 1, `${pages.join(' + ')} state more than one minimum age: ${[...ages].join(', ')}`);
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
  const m = html.match(new RegExp(`<h2 id="${id}">[\\s\\S]*?(?=<h2[ >]|<div class="footer">)`));
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

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error(`check-site: ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`check-site: all ${checks} checks passed (${siteFiles.length} files${baseline ? ', baseline compared' : ''})`);
