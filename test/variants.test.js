const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { renderStack, selectBlocks, addImport, DEFAULT_STACK, STACK_KEYS } = require('../src/utils/variants');
const { findBlock, readBlock, writeBlock, eolOf } = require('../src/utils/indexBlock');
const { listSkills, listSkillFiles, readTemplate, renderAgentsMd, toIndexBlock } = require('../src/utils/templates');

const ESM_V12 = { moduleType: 'esm', importStyle: 'js', testRunner: 'vitest', linter: 'oxlint' };
const CJS_V12 = { moduleType: 'cjs', importStyle: 'bare', testRunner: 'jest', linter: 'oxlint' };
const STACKS = { default: DEFAULT_STACK, 'cjs-v12': CJS_V12, 'esm-v12': ESM_V12 };

/** Every shipped template, as a path relative to templates/. */
const TEMPLATES = [
    'AGENTS.md',
    ...listSkills().flatMap((s) => listSkillFiles(s).map((f) => `skills/${s}/${f}`)),
];

test('stack blocks: kept or dropped by key, markers never left behind', () => {
    const src = 'a\n<!-- stack:vitest -->\nv\n<!-- /stack -->\n<!-- stack:jest|eslint -->\nj\n<!-- /stack -->\nz';
    assert.equal(selectBlocks(src, DEFAULT_STACK), 'a\nj\nz');
    assert.equal(selectBlocks(src, ESM_V12), 'a\nv\nz');
    assert.equal(selectBlocks(src, CJS_V12), 'a\nj\nz', 'jest|eslint: either key keeps it');
});

test('stack blocks: malformed markers fail loudly instead of leaking into a skill', () => {
    assert.throws(() => selectBlocks('<!-- stack:vitest -->\nx', DEFAULT_STACK), /not closed/);
    assert.throws(() => selectBlocks('x\n<!-- /stack -->', DEFAULT_STACK), /never opened/);
    assert.throws(() => selectBlocks('<!-- stack:mocha -->\n<!-- /stack -->', DEFAULT_STACK), /unknown stack key "mocha"/);
    assert.throws(() => selectBlocks('<!-- stack:jest -->\n<!-- stack:vitest -->\n<!-- /stack -->\n<!-- /stack -->', DEFAULT_STACK), /nested/);
});

test('every shipped template renders for every stack, with no marker left', () => {
    for (const rel of TEMPLATES) {
        const src = readTemplate(rel);
        for (const [name, stack] of Object.entries(STACKS)) {
            const out = rel === 'AGENTS.md' ? renderAgentsMd(src, { skillsDir: '.x/skills', stack }) : renderStack(src, stack, rel);
            assert.doesNotMatch(out, /<!-- \/?stack/, `${rel} (${name}) leaks a marker`);
            assert.ok(!out.includes('{{'), `${rel} (${name}) leaks a placeholder`);
        }
        for (const m of src.matchAll(/<!-- stack:([a-z|-]+) -->/g)) {
            for (const k of m[1].split('|')) assert.ok(STACK_KEYS.includes(k), `${rel}: ${k}`);
        }
    }
});

test('default stack (Jest + ESLint, extensionless) renders the templates without their blocks only', () => {
    for (const rel of TEMPLATES.filter((r) => r !== 'AGENTS.md')) {
        const src = readTemplate(rel);
        const expected = selectBlocks(src, DEFAULT_STACK);
        assert.equal(renderStack(src, DEFAULT_STACK, rel), expected, rel);
    }
});

test('Vitest stack: no jest API is left in any skill, and Mock is imported from vitest', () => {
    for (const rel of TEMPLATES) {
        const out = renderStack(readTemplate(rel), ESM_V12, rel);
        assert.doesNotMatch(out, /\bjest\.(fn|Mock|spyOn|mock)\b/, rel);
        for (const [, code] of out.matchAll(/```ts\n([\s\S]*?)```/g)) {
            if (/\bMock\b/.test(code) && /\bvi\.fn\(/.test(code)) {
                assert.match(code, /^import type \{ Mock \} from 'vitest';$/m, `${rel}: block uses Mock without importing it`);
            }
        }
    }
});

test('ESM stack: every relative import in a TypeScript example ends in .js', () => {
    for (const rel of TEMPLATES) {
        const out = renderStack(readTemplate(rel), ESM_V12, rel);
        for (const [, code] of out.matchAll(/```ts\n([\s\S]*?)```/g)) {
            for (const [, spec] of code.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
                assert.match(spec, /\.js$/, `${rel}: ${spec}`);
            }
        }
    }
});

test('oxlint stack: git-workflow never tells the agent to run eslint', () => {
    const out = renderStack(readTemplate('skills/git-workflow/SKILL.md'), CJS_V12);
    assert.doesNotMatch(out, /npx eslint "/, 'no runnable eslint command');
    assert.doesNotMatch(out, /eslint\.config\.mjs/);
    assert.match(out, /npm run lint/);
    assert.match(out, /\.oxlintrc\.json/);
    const eslint = renderStack(readTemplate('skills/git-workflow/SKILL.md'), DEFAULT_STACK);
    assert.match(eslint, /npx eslint "\{src,apps,libs,test\}\/\*\*\/\*\.ts"/);
    assert.doesNotMatch(eslint, /oxlint/);
});

test('ESM rendering of a code block, compared in full', () => {
    const src = [
        'Use `jest.fn()` and `\'../prisma/prisma.service\'`.',
        '',
        '```ts',
        '// src/teams/teams.service.spec.ts',
        "import { Test } from '@nestjs/testing';",
        "import { PrismaService } from '../prisma/prisma.service';",
        "import { TeamsService } from './teams.service';",
        '',
        'let prisma: { team: { findUnique: jest.Mock } };',
        'prisma = { team: { findUnique: jest.fn() } };',
        "jest.spyOn(service, 'x');",
        '```',
        '',
        '```json',
        '{ "a": "./x" }',
        '```',
    ].join('\n');
    const expected = [
        "Use `vi.fn()` and `'../prisma/prisma.service.js'`.",
        '',
        '```ts',
        '// src/teams/teams.service.spec.ts',
        "import { Test } from '@nestjs/testing';",
        "import type { Mock } from 'vitest';",
        "import { PrismaService } from '../prisma/prisma.service.js';",
        "import { TeamsService } from './teams.service.js';",
        '',
        'let prisma: { team: { findUnique: Mock } };',
        'prisma = { team: { findUnique: vi.fn() } };',
        "vi.spyOn(service, 'x');",
        '```',
        '',
        '```json',
        '{ "a": "./x" }',
        '```',
    ].join('\n');
    assert.equal(renderStack(src, ESM_V12), expected);
});

test('addImport: after the last package import, or under the file comment when there is none', () => {
    assert.equal(
        addImport("import { a } from 'a';\nimport {\n  b,\n} from 'b';\nimport { c } from './c';\nx;", 'NEW;'),
        "import { a } from 'a';\nimport {\n  b,\n} from 'b';\nNEW;\nimport { c } from './c';\nx;",
    );
    assert.equal(addImport("import { c } from './c';\nx;", 'NEW;'), "NEW;\nimport { c } from './c';\nx;");
    assert.equal(addImport('// file.ts\nconst a = 1;', 'NEW;'), '// file.ts\nNEW;\nconst a = 1;');
});

test('index block: appended after the user text, replaced in place, nothing else changes', () => {
    const own = '# AGENTS.md\n\n## NestJS\n\nUpstream text.\n';
    const first = writeBlock(own, 'BODY v1');
    assert.ok(first.startsWith(own));
    assert.equal(readBlock(first), 'BODY v1');

    const withFooter = `${first}\nFooter.\n`;
    const second = writeBlock(withFooter, 'BODY v2');
    assert.equal(readBlock(second), 'BODY v2');
    const at = findBlock(second);
    assert.equal(second.slice(0, at.start), own + '\n', 'text before the block is byte-identical');
    assert.equal(second.slice(at.end), '\n\nFooter.\n', 'text after the block is byte-identical');
});

test('index block: CRLF files stay CRLF, and the separator does not grow on rewrite', () => {
    const own = '# Mine\r\n\r\nText.\r\n';
    const out = writeBlock(own, 'line 1\nline 2');
    assert.equal(eolOf(out), '\r\n');
    assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/, 'no bare LF was introduced');
    assert.equal(readBlock(out), 'line 1\r\nline 2');
    assert.equal(writeBlock(out, 'line 1\nline 2'), out, 'rewriting the same body is a no-op');
    assert.equal(writeBlock('', 'B').startsWith('<!-- nest-skills:start -->'), true);
});

test('index block: headings are nested one level under the host file', () => {
    const block = toIndexBlock('# AGENTS.md: NestJS standards (Everill)\n\ntext\n\n## Which skill\n\n```bash\n# not a heading\n```\n');
    assert.equal(block, '## NestJS standards (Everill)\n\ntext\n\n### Which skill\n\n```bash\n# not a heading\n```');
});

test('AGENTS.md names the detected stack', () => {
    const out = renderAgentsMd(readTemplate('AGENTS.md'), { skillsDir: '.opencode/skills', stack: ESM_V12 });
    assert.match(out, /\*\*Project stack\*\* .*: ESM · \.js imports · Vitest · oxlint\./);
    assert.doesNotMatch(out, /@typescript-eslint\/no-explicit-any/);
    assert.match(out, /typescript\/no-explicit-any/);
});

test('shared detectStack.js is the verbatim copy and only needs node built-ins', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'detectStack.js'), 'utf8');
    assert.match(src, /shared verbatim/i);
    const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(requires)].sort(), ['fs', 'path']);
});
