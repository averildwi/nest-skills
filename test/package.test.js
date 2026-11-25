// Published package metadata and release docs. Run: node --test test/package.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const pkg = require('../package.json');
const lock = require('../package-lock.json');
const root = path.join(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('package identity and entrypoints are valid', () => {
    assert.equal(pkg.name, '@averildwi/nest-skills');
    assert.equal(pkg.type, 'commonjs');
    assert.equal(pkg.license, 'MIT');
    assert.equal(pkg.engines.node, '^20.19 || ^22.12 || >=24.0');
    const binPath = path.join(root, pkg.bin['nest-skills']);
    assert.ok(fs.existsSync(binPath), `missing ${pkg.bin['nest-skills']}`);
    assert.match(fs.readFileSync(binPath, 'utf8'), /^#!\/usr\/bin\/env node/, 'bin needs a node shebang');
});

test('package.json and package-lock.json agree', () => {
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[''].version, pkg.version);
    assert.deepEqual(lock.packages[''].engines, pkg.engines);
});

test('published files exist and exclude tests', () => {
    for (const required of ['bin', 'src', 'templates', 'docs', 'CHANGELOG.md']) {
        assert.ok(pkg.files.includes(required), `files must include ${required}`);
    }
    for (const entry of pkg.files) {
        assert.ok(fs.existsSync(path.join(root, entry)), `files entry does not exist: ${entry}`);
    }
    assert.ok(!pkg.files.includes('test'), 'test/ must not be published');
});

test('release docs and changelog are present', () => {
    for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md', 'docs/release.md', 'docs/USAGE.md']) {
        assert.ok(fs.existsSync(path.join(root, f)), f);
    }
    const changelog = read('CHANGELOG.md');
    assert.match(changelog, /## \[Unreleased\]/);
    assert.ok(changelog.includes(`## [${pkg.version}]`), 'CHANGELOG must contain the current version');
    assert.ok(changelog.includes(`[${pkg.version}]: https://github.com/averildwi/nest-skills/`), 'CHANGELOG needs a link for the current version');
});

test('test script runs every test file', () => {
    assert.match(pkg.scripts.test, /^node --test /);
    for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.js'))) {
        assert.ok(pkg.scripts.test.includes(`test/${f}`), `npm test does not run test/${f}`);
    }
});
