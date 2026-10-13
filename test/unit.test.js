const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseCliArgs } = require('../src/cli');
const { CliError } = require('../src/errors');
const { hash, normalize } = require('../src/utils/fsHelpers');
const { listSkills, readTemplate, renderAgentsMd, renderClaudeMd } = require('../src/utils/templates');
const { decideFile } = require('../src/steps/decide');
const { buildManifest } = require('../src/steps/writeManifest');
const { runPreflight } = require('../src/preflight');
const { AGENTS } = require('../src/config/agents');

const EXPECTED_SKILLS = [
    'git-workflow',
    'nest-architecture',
    'nest-auth-and-security',
    'nest-prisma',
    'nest-response-and-errors',
    'nest-testing',
    'nest-validation-and-config',
];

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'nsk-unit-'));
}

test('argv: defaults to install and leaves unset options undefined', () => {
    const o = parseCliArgs([]);
    assert.equal(o.command, 'install');
    assert.equal(o.agent, undefined);
    assert.equal(o.dir, undefined);
    assert.equal(o.force, false);
});

test('argv: update command, agent, dir, force, dry-run', () => {
    const o = parseCliArgs(['update', '--agent', 'Claude', '--dir', './.agents/skills/', '--force', '--dry-run']);
    assert.equal(o.command, 'update');
    assert.equal(o.agent, 'claude');
    assert.equal(o.dir, '.agents/skills');
    assert.equal(o.force, true);
    assert.equal(o.dryRun, true);
});

test('argv: rejects unknown agent, command, flag and unsafe dir', () => {
    assert.throws(() => parseCliArgs(['--agent', 'cursor']), CliError);
    assert.throws(() => parseCliArgs(['remove']), CliError);
    assert.throws(() => parseCliArgs(['--nope']), CliError);
    for (const bad of ['../outside', '/abs', 'C:/x', 'a/../../b', '', '   ', '.', './', '.\\', './.', 'a/./b', '\\\\server\\share', 'node_modules/x', '.nest-skills-backup/x']) {
        assert.throws(() => parseCliArgs(['--dir', bad]), CliError, bad);
    }
    assert.equal(parseCliArgs(['--dir', '.\\.agents\\\\skills\\']).dir, '.agents/skills');
});

test('hash ignores CRLF vs LF', () => {
    assert.equal(hash('a\r\nb\r\n'), hash('a\nb\n'));
    assert.equal(normalize('a\r\nb'), 'a\nb');
});

test('templates: all seven skills ship, with frontmatter name matching the folder', () => {
    assert.deepEqual(listSkills(), EXPECTED_SKILLS);
    for (const name of EXPECTED_SKILLS) {
        const src = readTemplate(`skills/${name}/SKILL.md`);
        const m = src.match(/^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/);
        assert.ok(m, `${name} has frontmatter`);
        assert.equal(m[1], name);
        assert.match(m[1], /^[a-z0-9]+(-[a-z0-9]+)*$/);
        assert.ok(m[2].length <= 1024);
        assert.ok(src.split('\n').length < 250, `${name} is under 250 lines`);
    }
});

test('templates: AGENTS.md placeholder is filled per agent, CLAUDE.md imports the index', () => {
    const src = readTemplate('AGENTS.md');
    assert.ok(src.includes('{{SKILLS_DIR}}'));
    for (const agent of Object.values(AGENTS)) {
        const out = renderAgentsMd(src, { skillsDir: agent.skillsDir });
        assert.ok(!out.includes('{{SKILLS_DIR}}'));
        assert.ok(out.includes(`\`${agent.skillsDir}/<name>/SKILL.md\``));
    }
    assert.match(renderClaudeMd(readTemplate('CLAUDE.md'), { indexFile: 'AGENTS.md' }), /^@AGENTS\.md$/m);
    assert.match(renderClaudeMd(readTemplate('CLAUDE.md'), { indexFile: 'AGENTS.nest-skills.md' }), /^@AGENTS\.nest-skills\.md$/m);
});

test('agents: "both" uses one shared folder that OpenCode and Claude Code both read', () => {
    assert.equal(AGENTS.both.skillsDir, '.claude/skills');
    assert.equal(AGENTS.opencode.claudeMd, false);
    assert.equal(AGENTS.claude.claudeMd, true);
});

async function decide(ctxOverrides, relPath, desired, current) {
    const root = tmp();
    if (current !== undefined) {
        fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
        fs.writeFileSync(path.join(root, relPath), current);
    }
    const ctx = { projectRoot: root, command: 'install', force: false, manifest: null, ...ctxOverrides };
    return decideFile(ctx, relPath, desired);
}

test('decide: missing file is created', async () => {
    const d = await decide({}, 'a.md', 'new');
    assert.equal(d.action, 'write');
    assert.equal(d.entry.kind, 'create');
    assert.equal(d.recordHash, hash('new'));
});

test('decide: identical file (even with CRLF) is skipped', async () => {
    const d = await decide({}, 'a.md', 'x\ny\n', 'x\r\ny\r\n');
    assert.equal(d.action, 'none');
    assert.equal(d.entry.reason, 'up to date');
});

test('decide: a file nest-skills never wrote is kept; --force adopts it with a backup', async () => {
    const kept = await decide({}, '.opencode/skills/x/SKILL.md', 'ours', 'theirs');
    assert.equal(kept.action, 'none');
    assert.equal(kept.foreign, true);
    assert.equal(kept.recordHash, undefined);
    const forced = await decide({ force: true }, '.opencode/skills/x/SKILL.md', 'ours', 'theirs');
    assert.equal(forced.action, 'write');
    assert.equal(forced.backup, true);
});

test('decide: a protected file of the user (AGENTS.md, CLAUDE.md) is never overwritten, even with --force', async () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'theirs');
    const d = await decideFile({ projectRoot: root, command: 'update', force: true, manifest: null }, 'AGENTS.md', 'ours', { protect: true });
    assert.equal(d.action, 'none');
    assert.equal(d.foreign, true);
});

test('decide: user-edited file is kept, and kept tracked with the old hash', async () => {
    const manifest = { files: { 'a.md': hash('v1') } };
    const d = await decide({ manifest }, 'a.md', 'v2', 'v1 + my edit');
    assert.equal(d.action, 'none');
    assert.equal(d.edited, true);
    assert.equal(d.recordHash, hash('v1'));
});

test('decide: --force overwrites a user-edited file with a backup', async () => {
    const manifest = { files: { 'a.md': hash('v1') } };
    const d = await decide({ manifest, force: true }, 'a.md', 'v2', 'v1 + my edit');
    assert.equal(d.action, 'write');
    assert.equal(d.backup, true);
});

test('decide: unedited old version -> install reports, update overwrites', async () => {
    const manifest = { files: { 'a.md': hash('v1') } };
    const onInstall = await decide({ manifest }, 'a.md', 'v2', 'v1');
    assert.equal(onInstall.action, 'none');
    assert.equal(onInstall.outdated, true);
    const onUpdate = await decide({ manifest, command: 'update' }, 'a.md', 'v2', 'v1');
    assert.equal(onUpdate.action, 'write');
    assert.equal(onUpdate.recordHash, hash('v2'));
});

test('decide: a changed agent refreshes config-rendered files on install, not skills', async () => {
    const manifest = { files: { 'a.md': hash('v1') } };
    const skill = await decide({ manifest, configChanged: true }, 'a.md', 'v2', 'v1');
    assert.equal(skill.action, 'none');
    assert.equal(skill.outdated, true);

    const root = tmp();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'v1');
    const ctx = { projectRoot: root, command: 'install', force: false, configChanged: true, manifest: { files: { 'AGENTS.md': hash('v1') } } };
    const index = await decideFile(ctx, 'AGENTS.md', 'v2', { protect: true, followsConfig: true });
    assert.equal(index.action, 'write');
});

test('manifest keeps previously tracked files and adds new ones', () => {
    const m = buildManifest({
        pkg: { name: '@averildwi/nest-skills', version: '9.9.9' },
        agent: AGENTS.claude,
        skillsDir: '.claude/skills',
        indexFile: 'AGENTS.md',
        manifest: { files: { 'old.md': 'h1' } },
        nextFiles: { 'new.md': 'h2' },
    });
    assert.deepEqual(m.files, { 'old.md': 'h1', 'new.md': 'h2' });
    assert.equal(m.agent, 'claude');
});

test('preflight: needs package.json with @nestjs/core', () => {
    const root = tmp();
    assert.throws(() => runPreflight(root), /No package\.json/);
    fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{"express":"4"}}');
    assert.throws(() => runPreflight(root), /NestJS/);
    fs.writeFileSync(path.join(root, 'package.json'), '{ broken');
    assert.throws(() => runPreflight(root), /not valid JSON/);
    fs.writeFileSync(path.join(root, 'package.json'), '{"devDependencies":{"@nestjs/core":"11"}}');
    assert.ok(runPreflight(root).pkgJson);
});
