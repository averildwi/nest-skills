// Shared verbatim with nest-cloudinary, nest-common and nest-skills, like
// src/utils/detectStack.js. Run: node --test test/detectStack.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { detectStack, withImportStyle, describeStack, importStyleOf } = require('../src/utils/detectStack');

function project(t, files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-stack-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [rel, content] of Object.entries(files)) {
        const file = path.join(dir, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    }
    return dir;
}

const APP_MODULE_BARE = "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller';\n";
const APP_MODULE_JS = "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller.js';\n";

// Shapes copied from `nest new` output (scripts trimmed to what detection reads).
const NEST11 = {
    'package.json': {
        scripts: { lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix', test: 'jest' },
        dependencies: { '@nestjs/core': '^11.0.1' },
        devDependencies: { eslint: '^9.18.0', jest: '^30.0.0' },
        jest: { rootDir: 'src' },
    },
    'eslint.config.mjs': '',
    'src/app.module.ts': APP_MODULE_BARE,
};
const NEST12_CJS = {
    'package.json': {
        scripts: {
            lint: 'oxlint --type-aware src/ test/',
            test: 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js',
        },
        dependencies: { '@nestjs/core': '^12.0.1' },
        devDependencies: { jest: '^30.0.0', oxlint: '^1.58.0' },
    },
    'jest.config.ts': '',
    '.oxlintrc.json': '{}',
    'src/app.module.ts': APP_MODULE_BARE,
};
const NEST12_ESM = {
    'package.json': {
        type: 'module',
        scripts: { lint: 'oxlint --type-aware src/ test/', test: 'vitest run' },
        dependencies: { '@nestjs/core': '^12.0.1' },
        devDependencies: { vitest: '^4.1.2', oxlint: '^1.58.0' },
    },
    'vitest.config.ts': '',
    '.oxlintrc.json': '{}',
    'src/app.module.ts': APP_MODULE_JS,
};

test('detectStack: Nest 11 template -> CommonJS, bare imports, Jest, ESLint', (t) => {
    const s = detectStack(project(t, NEST11));
    assert.equal(s.moduleType, 'cjs');
    assert.equal(s.importStyle, 'bare');
    assert.equal(s.importStyleSource, 'src/app.module.ts');
    assert.equal(s.testRunner, 'jest');
    assert.equal(s.jestConfig, null);
    assert.equal(s.linter, 'eslint');
    assert.equal(s.nestMajor, 11);
});

test('detectStack: Nest 12 CommonJS template -> Jest via node script, jest.config.ts, oxlint', (t) => {
    const s = detectStack(project(t, NEST12_CJS));
    assert.equal(s.moduleType, 'cjs');
    assert.equal(s.importStyle, 'bare');
    assert.equal(s.testRunner, 'jest');
    assert.equal(s.testRunnerSource, 'script');
    assert.equal(s.jestConfig, 'jest.config.ts');
    assert.equal(s.linter, 'oxlint');
    assert.equal(s.nestMajor, 12);
});

test('detectStack: Nest 12 ESM template -> .js imports, Vitest, oxlint', (t) => {
    const s = detectStack(project(t, NEST12_ESM));
    assert.equal(s.moduleType, 'esm');
    assert.equal(s.importStyle, 'js');
    assert.equal(s.testRunner, 'vitest');
    assert.equal(s.vitestConfig, 'vitest.config.ts');
    assert.equal(s.linter, 'oxlint');
    assert.equal(describeStack(s), 'ESM · .js imports · Vitest · oxlint');
});

test('detectStack: ESM always uses .js, even if app.module is extensionless', (t) => {
    const s = detectStack(project(t, { ...NEST12_ESM, 'src/app.module.ts': APP_MODULE_BARE }));
    assert.equal(s.importStyle, 'js');
});

test('detectStack: CommonJS that already writes .js keeps that style', (t) => {
    const s = detectStack(project(t, { ...NEST12_CJS, 'src/app.module.ts': APP_MODULE_JS }));
    assert.equal(s.moduleType, 'cjs');
    assert.equal(s.importStyle, 'js');
});

test('detectStack: falls back to main.ts, then to bare', (t) => {
    const noModule = { 'package.json': {}, 'src/main.ts': "import { AppModule } from './app.module.js';\n" };
    assert.equal(detectStack(project(t, noModule)).importStyle, 'js');
    const nothing = detectStack(project(t, { 'package.json': {} }));
    assert.equal(nothing.importStyle, 'bare');
    assert.equal(nothing.importStyleSource, 'default');
    assert.equal(nothing.testRunner, null);
    assert.equal(nothing.linter, null);
    assert.equal(describeStack(nothing), 'CommonJS · extensionless imports · no test runner · no linter');
});

test('detectStack: the script wins over a stale dependency', (t) => {
    const s = detectStack(
        project(t, {
            'package.json': {
                scripts: { test: 'vitest run', lint: 'oxlint src' },
                devDependencies: { jest: '^29', vitest: '^4', eslint: '^9', oxlint: '^1' },
            },
        }),
    );
    assert.equal(s.testRunner, 'vitest');
    assert.equal(s.linter, 'oxlint');
});

test('detectStack: config files are the last resort, and hoisted tools are found at the workspace root', (t) => {
    const byConfig = detectStack(project(t, { 'package.json': {}, 'vitest.config.mts': '', 'eslint.config.js': '' }));
    assert.equal(byConfig.testRunner, 'vitest');
    assert.equal(byConfig.testRunnerSource, 'vitest.config.mts');
    assert.equal(byConfig.linter, 'eslint');

    const root = project(t, {
        'package.json': { devDependencies: { jest: '^30', eslint: '^9' } },
        'apps/api/package.json': { dependencies: { '@nestjs/core': '^12.0.0' } },
    });
    const member = detectStack(path.join(root, 'apps', 'api'), { workspaceRoot: root });
    assert.equal(member.testRunner, 'jest');
    assert.equal(member.linter, 'eslint');
});

test('importStyleOf: ignores package imports and non-JS extensions', () => {
    assert.equal(importStyleOf("import x from 'lodash';"), null);
    assert.equal(importStyleOf("import data from './data.json';"), null);
    assert.equal(importStyleOf("import a from './a.js';\nimport b from './b';"), 'js');
    assert.equal(importStyleOf("import a from './a';\nimport b from '../b';\nimport c from './c.js';"), 'bare');
});

test('withImportStyle: adds or strips .js on relative specifiers only', () => {
    const js = { importStyle: 'js' };
    const bare = { importStyle: 'bare' };
    assert.equal(withImportStyle('./prisma.service', js), './prisma.service.js');
    assert.equal(withImportStyle('./prisma.service.js', js), './prisma.service.js');
    assert.equal(withImportStyle('./prisma.service.js', bare), './prisma.service');
    assert.equal(withImportStyle('../../generated/prisma/client', js), '../../generated/prisma/client.js');
    assert.equal(withImportStyle('@prisma/adapter-pg', js), '@prisma/adapter-pg');
    assert.equal(withImportStyle('./data.json', js), './data.json');
    assert.equal(withImportStyle('./prisma.service', undefined), './prisma.service');
});
