/**
 * /ship PR-title-version rule is ALWAYS-LOADED — token-reduction safety net (gate, free).
 *
 * The anxiety this kills: the v1.54.0.0 carve ("carve /ship into skeleton +
 * on-demand sections, -59% always-loaded") moved the rule "PR title MUST start
 * with v$NEW_VERSION" out of the always-loaded monolith and entirely into the
 * lazily-loaded `ship/sections/pr-body.md`. The agent then sets the version
 * prefix only if it happens to read that section before creating the PR; when it
 * doesn't, PRs land with bare titles. This is the exact regression that shipped
 * — every recent open PR lacked a `v...` prefix until this guard + the skeleton
 * invariant restored it.
 *
 * This is the title-rule analogue of `test/auq-format-always-loaded.test.ts`,
 * which guards the AskUserQuestion format the same way. A carve that re-buries
 * the title rule fails here in milliseconds instead of surfacing weeks later as
 * a wave of version-less PR titles.
 *
 * The guarantee, made mechanical and per-PR:
 *   1. SKELETON PRESENCE — `ship/SKILL.md` (the always-loaded skeleton) carries
 *      the invariant: the `v$NEW_VERSION` token, the single-source-of-truth
 *      helper name, and a directive near a "PR title" mention. Present the
 *      instant /ship reaches the push/PR steps, no section read required.
 *   2. UNION SURVIVAL (both paths) — the FULL procedure still exists somewhere
 *      in skeleton+sections for BOTH the create path (`gh pr create --title
 *      "v$NEW_VERSION ...`) AND the existing-PR update path (the `gh pr edit
 *      --title` rewrite rule). A drop of either is the failure.
 */
import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SHIP_SKILL = path.join(ROOT, 'ship', 'SKILL.md');
const SHIP_SECTIONS = path.join(ROOT, 'ship', 'sections');

function readUnion(): string {
  let union = fs.readFileSync(SHIP_SKILL, 'utf-8');
  for (const f of fs.readdirSync(SHIP_SECTIONS)) {
    if (f.endsWith('.md') && !f.endsWith('.md.tmpl')) {
      union += '\n' + fs.readFileSync(path.join(SHIP_SECTIONS, f), 'utf-8');
    }
  }
  return union;
}

describe('/ship PR-title-version rule is always-loaded (token-reduction safety net)', () => {
  test('sanity: ship is a carved skill (has sections/*.md)', () => {
    // Guards against a path regression that would make the union/skeleton checks
    // vacuously pass against a non-carved skill.
    expect(fs.existsSync(SHIP_SECTIONS)).toBe(true);
    expect(fs.readdirSync(SHIP_SECTIONS).some(f => f.endsWith('.md'))).toBe(true);
  });

  test('skeleton (ship/SKILL.md) carries the PR-title-version invariant', () => {
    const skeleton = fs.readFileSync(SHIP_SKILL, 'utf-8');
    // Robust independent markers, NOT one brittle full-sentence regex (so
    // rewording the prose doesn't false-fail). All three must be present in the
    // always-loaded skeleton.
    const markers: Array<{ name: string; re: RegExp }> = [
      { name: 'v$NEW_VERSION token', re: /v\$NEW_VERSION/ },
      { name: 'gstack-pr-title-rewrite helper reference', re: /gstack-pr-title-rewrite/ },
      { name: 'a directive (MUST/always/never) near a PR-title mention', re: /(MUST|always|never)[^\n]{0,80}\btitle\b|\btitle\b[^\n]{0,80}(MUST|always|never)/i },
    ];
    const missing = markers.filter(m => !m.re.test(skeleton));
    if (missing.length > 0) {
      throw new Error(
        `ship/SKILL.md (the always-loaded skeleton) is missing the PR-title-version ` +
          `invariant — a carve likely re-buried it in sections/. Missing:\n` +
          missing.map(m => `  - ${m.name} (${m.re.source})`).join('\n'),
      );
    }
  });

  test('union (skeleton+sections) keeps BOTH the create and the update title rules', () => {
    const union = readUnion();
    const paths: Array<{ name: string; re: RegExp }> = [
      // create path: `gh pr create --title "v$NEW_VERSION ...`
      { name: 'PR create path prefixes the version', re: /pr create[^\n]*--title[^\n]*v\$NEW_VERSION/i },
      // update/idempotent path: the existing-PR `gh pr edit --title` rewrite rule
      { name: 'PR update path rewrites the title', re: /pr edit[^\n]*--title/i },
    ];
    const missing = paths.filter(p => !p.re.test(union));
    if (missing.length > 0) {
      throw new Error(
        `ship skeleton+sections dropped a PR-title-version code path. The update ` +
          `path is the more important idempotent /ship path — a create-only guard ` +
          `would miss its rot. Missing:\n` +
          missing.map(p => `  - ${p.name} (${p.re.source})`).join('\n'),
      );
    }
  });
});
