/**
 * Integration tests: run the real CLI (bin/cli.js) as a child process in a
 * temporary fake Nest project. stdin is not a TTY, so there are no prompts.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.join(__dirname, '..', 'bin', 'cli.js');
const SKILLS = fs.readdirSync(path.join(__dirname, '..', 'templates', 'skills')).sort();

function nestProject(extra = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsk-int-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { '@nestjs/core': '^11.0.0' } }));
    for (const [rel, content] of Object.entries(extra)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), content);
    }
    return root;
}

function run(root, args) {
    const r = spawnSync(process.execPath, [BIN, ...args, '--no-color'], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Every file under root, relative, excluding package.json. */
function snapshot(root) {
    const files = {};
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) walk(abs);
            else files[path.relative(root, abs).split(path.sep).join('/')] = fs.readFileSync(abs, 'utf8');
        }
    };
    walk(root);
    delete files['package.json'];
    return files;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

/** Backups of `rel` across all runs, oldest first. */
function backups(root, rel) {
    const dir = path.join(root, '.nest-skills-backup');
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .map((stamp) => `.nest-skills-backup/${stamp}/${rel}`)
        .filter((f) => exists(root, f));
}

function assertBackedUp(root, rel, content) {
    const found = backups(root, rel);
    assert.equal(found.length, 1, `one backup of ${rel}`);
    assert.equal(read(root, found[0]), content);
    assert.equal(read(root, '.nest-skills-backup/.gitignore'), '*\n');
    assert.ok(!exists(root, `${rel}.bak`), 'no .bak next to the file');
}

test('opencode: installs 7 skills + AGENTS.md pointing at .opencode/skills, no CLAUDE.md', () => {
    const root = nestProject();
    const r = run(root, ['--agent', 'opencode', '--yes']);
    assert.equal(r.code, 0, r.err);
    for (const s of SKILLS) assert.ok(exists(root, `.opencode/skills/${s}/SKILL.md`), s);
    assert.equal(SKILLS.length, 7);
    assert.match(read(root, 'AGENTS.md'), /`\.opencode\/skills\/<name>\/SKILL\.md`/);
    assert.ok(!read(root, 'AGENTS.md').includes('{{'));
    assert.ok(!exists(root, 'CLAUDE.md'));
    const m = JSON.parse(read(root, '.nest-skills.json'));
    assert.equal(m.agent, 'opencode');
    assert.equal(Object.keys(m.files).length, 8);
});

test('claude and both: .claude/skills + thin CLAUDE.md importing AGENTS.md', () => {
    for (const agent of ['claude', 'both']) {
        const root = nestProject();
        assert.equal(run(root, ['--agent', agent, '--yes']).code, 0);
        for (const s of SKILLS) assert.ok(exists(root, `.claude/skills/${s}/SKILL.md`));
        assert.ok(!exists(root, '.opencode'));
        assert.match(read(root, 'AGENTS.md'), /`\.claude\/skills\/<name>\/SKILL\.md`/);
        assert.match(read(root, 'CLAUDE.md'), /^@AGENTS\.md$/m);
    }
});

test('idempotent: a second run changes nothing', () => {
    const root = nestProject();
    run(root, ['--agent', 'both', '--yes']);
    const before = snapshot(root);
    const r = run(root, ['--yes']); // agent comes from the manifest
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Nothing to do/);
    assert.doesNotMatch(r.out, /Skills are installed\./);
    assert.doesNotMatch(r.out, /git add/);
    assert.deepEqual(snapshot(root), before);
});

test('--dry-run writes nothing', () => {
    const root = nestProject();
    const r = run(root, ['--agent', 'opencode', '--dry-run']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Dry run complete/);
    assert.deepEqual(snapshot(root), {});
});

test('--dir overrides the skills folder and AGENTS.md follows it', () => {
    const root = nestProject();
    assert.equal(run(root, ['--agent', 'opencode', '--dir', '.agents/skills', '--yes']).code, 0);
    assert.ok(exists(root, '.agents/skills/nest-prisma/SKILL.md'));
    assert.match(read(root, 'AGENTS.md'), /`\.agents\/skills\/<name>\/SKILL\.md`/);
    // The folder is remembered.
    assert.match(run(root, ['--yes']).out, /Nothing to do/);
});

test('existing AGENTS.md and CLAUDE.md of the user are never touched', () => {
    const root = nestProject({ 'AGENTS.md': '# My rules\n', 'CLAUDE.md': '# Claude notes\n' });
    const r = run(root, ['--agent', 'claude', '--yes', '--force']);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(root, 'AGENTS.md'), '# My rules\n');
    assert.equal(read(root, 'CLAUDE.md'), '# Claude notes\n');
    assert.ok(exists(root, 'AGENTS.nest-skills.md'));
    assert.match(read(root, 'AGENTS.nest-skills.md'), /\.claude\/skills/);
    assert.match(r.out, /Add @AGENTS\.nest-skills\.md as the first line of CLAUDE\.md/);
    assert.match(r.out, /Read AGENTS\.nest-skills\.md before writing NestJS code/);
    assert.match(r.out, /git add AGENTS\.nest-skills\.md \.claude\/skills \.nest-skills\.json/);
});

test('user AGENTS.md that already links the fallback index gets no link hint', () => {
    const root = nestProject({ 'AGENTS.md': '# My rules\n' });
    assert.match(run(root, ['--agent', 'opencode', '--yes']).out, /Link the index from your AGENTS\.md/);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# My rules\nRead AGENTS.nest-skills.md before writing NestJS code.\n');
    const r = run(root, ['--yes']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /already links AGENTS\.nest-skills\.md/);
    assert.doesNotMatch(r.out, /Link the index from your AGENTS\.md/);
});

test('user CLAUDE.md that already imports the index is accepted silently', () => {
    const root = nestProject({ 'CLAUDE.md': '@AGENTS.md\n\nMy notes\n' });
    const r = run(root, ['--agent', 'claude', '--yes']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /already imports @AGENTS\.md/);
    assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n\nMy notes\n');
});

test('a pre-existing skill file of the user is kept; --force replaces it with a backup outside the skills folder', () => {
    const root = nestProject({ '.opencode/skills/nest-prisma/SKILL.md': 'my own prisma rules\n' });
    const r = run(root, ['--agent', 'opencode', '--yes']);
    assert.match(r.out, /use --force to replace it/);
    assert.equal(read(root, '.opencode/skills/nest-prisma/SKILL.md'), 'my own prisma rules\n');
    assert.ok(exists(root, '.opencode/skills/nest-testing/SKILL.md'));
    assert.ok(!('.opencode/skills/nest-prisma/SKILL.md' in JSON.parse(read(root, '.nest-skills.json')).files));

    const forced = run(root, ['--yes', '--force']);
    assert.equal(forced.code, 0, forced.err);
    assertBackedUp(root, '.opencode/skills/nest-prisma/SKILL.md', 'my own prisma rules\n');
    assert.match(forced.out, /Backups of replaced files/);
    assert.match(read(root, '.opencode/skills/nest-prisma/SKILL.md'), /^---\nname: nest-prisma\n/);
    assert.ok('.opencode/skills/nest-prisma/SKILL.md' in JSON.parse(read(root, '.nest-skills.json')).files);
});

test('edited skill: install and update keep it; --force replaces it with a backup', () => {
    const root = nestProject();
    run(root, ['--agent', 'opencode', '--yes']);
    const file = '.opencode/skills/nest-testing/SKILL.md';
    const edited = `${read(root, file)}\n## Local addition\n`;
    fs.writeFileSync(path.join(root, file), edited);

    const upd = run(root, ['update', '--yes']);
    assert.equal(upd.code, 0, upd.err);
    assert.match(upd.out, /edited by you, kept/);
    assert.equal(read(root, file), edited);

    const forced = run(root, ['update', '--yes', '--force']);
    assert.equal(forced.code, 0, forced.err);
    assertBackedUp(root, file, edited);
    assert.ok(!read(root, file).includes('## Local addition'));
});

test('update refreshes unedited files that are older than the bundled version', () => {
    const root = nestProject();
    run(root, ['--agent', 'opencode', '--yes']);
    // Simulate an install made by an older version: older content, manifest hash matches it.
    const file = '.opencode/skills/git-workflow/SKILL.md';
    const old = '---\nname: git-workflow\ndescription: old\n---\nold body\n';
    fs.writeFileSync(path.join(root, file), old);
    const manifest = JSON.parse(read(root, '.nest-skills.json'));
    manifest.files[file] = require('../src/utils/fsHelpers').hash(old);
    fs.writeFileSync(path.join(root, '.nest-skills.json'), JSON.stringify(manifest));

    const install = run(root, ['--yes']);
    assert.match(install.out, /newer version available/);
    assert.equal(read(root, file), old);

    const upd = run(root, ['update', '--yes']);
    assert.equal(upd.code, 0, upd.err);
    assert.ok(read(root, file).includes('Conventional Commits'));
});

test('CRLF checkout (git autocrlf) does not count as an edit', () => {
    const root = nestProject();
    run(root, ['--agent', 'opencode', '--yes']);
    const file = '.opencode/skills/nest-prisma/SKILL.md';
    fs.writeFileSync(path.join(root, file), read(root, file).replace(/\n/g, '\r\n'));
    assert.match(run(root, ['update', '--yes']).out, /Nothing to do/);
});

test('update without a previous install fails with a hint', () => {
    const r = run(nestProject(), ['update', '--yes']);
    assert.equal(r.code, 2);
    assert.match(r.err, /No previous install/);
});

test('non-interactive install without --agent fails with exit code 2', () => {
    const r = run(nestProject(), ['--yes']);
    assert.equal(r.code, 2);
    assert.match(r.err, /--agent/);
});

test('non-Nest project is refused and nothing is written', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsk-int-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{"express":"^4"}}');
    const r = run(root, ['--agent', 'opencode', '--yes']);
    assert.equal(r.code, 1);
    assert.match(r.err, /doesn't look like a NestJS project/);
    assert.deepEqual(snapshot(root), {});
});

test('never touches .env or package.json', () => {
    const root = nestProject({ '.env': 'SECRET=1\n' });
    const pkgBefore = read(root, 'package.json');
    run(root, ['--agent', 'both', '--yes']);
    assert.equal(read(root, '.env'), 'SECRET=1\n');
    assert.equal(read(root, 'package.json'), pkgBefore);
});

test('switching agent rewrites unedited AGENTS.md and warns about the old skills folder', () => {
    const root = nestProject();
    run(root, ['--agent', 'opencode', '--yes']);
    const r = run(root, ['--agent', 'claude', '--yes']);
    assert.equal(r.code, 0, r.err);
    assert.match(read(root, 'AGENTS.md'), /`\.claude\/skills\/<name>\/SKILL\.md`/);
    assert.match(read(root, 'CLAUDE.md'), /^@AGENTS\.md$/m);
    assert.match(r.out, /previous install used \.opencode\/skills/);
    assert.ok(exists(root, '.opencode/skills/nest-prisma/SKILL.md'), 'old folder is not deleted');
    assert.equal(JSON.parse(read(root, '.nest-skills.json')).agent, 'claude');
});

test('switching claude -> both keeps the shared folder and does not touch skills', () => {
    const root = nestProject();
    run(root, ['--agent', 'claude', '--yes']);
    // An older unedited skill from a previous version.
    const file = '.claude/skills/git-workflow/SKILL.md';
    const old = '---\nname: git-workflow\ndescription: old\n---\nold body\n';
    fs.writeFileSync(path.join(root, file), old);
    const manifest = JSON.parse(read(root, '.nest-skills.json'));
    manifest.files[file] = require('../src/utils/fsHelpers').hash(old);
    fs.writeFileSync(path.join(root, '.nest-skills.json'), JSON.stringify(manifest));

    const r = run(root, ['--agent', 'both', '--yes']);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(root, file), old, 'install does not refresh skills just because the agent changed');
    assert.match(r.out, /newer version available/);
    assert.doesNotMatch(r.out, /Old skills folder still present/);
    assert.equal(JSON.parse(read(root, '.nest-skills.json')).agent, 'both');
});

test('--help and --version', () => {
    const root = nestProject();
    assert.match(run(root, ['--help']).out, /Usage/);
    assert.match(run(root, ['--version']).out, /^\d+\.\d+\.\d+\n$/);
});
