/**
 * Detects the project stack the generated files must fit: module format,
 * relative import style, test runner and linter.
 *
 * Facts are read from the project itself, never inferred from the Nest major:
 * a Nest 11 app can be ESM and a Nest 12 app can be CommonJS.
 *
 * This file is shared verbatim by @averildwi/nest-prisma, nest-cloudinary,
 * nest-common and nest-skills. It only uses node built-ins. Change it in one
 * package, then copy it to the others (test/detectStack.test.js is shared too).
 */
const fs = require('fs');
const path = require('path');

const TEST_RUNNERS = ['vitest', 'jest'];
const LINTERS = ['oxlint', 'eslint'];

const JEST_CONFIGS = ['jest.config.ts', 'jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json'];
const VITEST_CONFIGS = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs'];
const ESLINT_CONFIGS = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc.js', '.eslintrc.json', '.eslintrc'];
const OXLINT_CONFIGS = ['.oxlintrc.json', 'oxlint.json', 'oxlint.config.ts'];

/** Files whose relative imports reveal the style the project already uses. */
const STYLE_PROBES = [path.join('src', 'app.module.ts'), path.join('src', 'main.ts')];

const RELATIVE_IMPORT = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;

/** `.js` in any flavour. Nest names like `./app.controller` have no extension. */
const JS_EXT = /\.(c|m)?js$/;
/** Real non-JS extensions a relative import may carry; never rewritten. */
const OTHER_EXT = /\.(json|node|wasm|css|html|txt|d\.ts|ts|mts|cts|tsx)$/i;

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function readText(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

function declared(pkg, name) {
    if (!pkg) return false;
    return ['dependencies', 'devDependencies', 'peerDependencies'].some((field) => Boolean(pkg[field] && pkg[field][name]));
}

function firstExisting(dir, names) {
    return names.find((name) => fs.existsSync(path.join(dir, name))) || null;
}

/**
 * "js" when relative imports end in `.js`, "bare" when they have no
 * extension, null when the source has no relative import to judge by.
 */
function importStyleOf(source) {
    if (!source) return null;
    let withJs = 0;
    let bare = 0;
    for (const [, spec] of source.matchAll(RELATIVE_IMPORT)) {
        if (JS_EXT.test(spec)) withJs += 1;
        else if (!OTHER_EXT.test(spec)) bare += 1;
    }
    if (!withJs && !bare) return null;
    return withJs >= bare ? 'js' : 'bare';
}

/**
 * Picks a tool from `candidates` (in priority order): the one the given
 * script runs, then a declared dependency, then a config file.
 */
function pickTool(candidates, { script, pkgs, dir, configs }) {
    if (script) {
        const hit = candidates.find((name) => new RegExp(`(^|[\\s/])${name}(\\s|$|\\.js)`).test(script));
        if (hit) return { name: hit, source: 'script' };
    }
    for (const pkg of pkgs) {
        const hit = candidates.find((name) => declared(pkg, name));
        if (hit) return { name: hit, source: 'dependency' };
    }
    for (const name of candidates) {
        const file = firstExisting(dir, configs[name]);
        if (file) return { name, source: file };
    }
    return { name: null, source: null };
}

function readMajor(range) {
    const match = String(range || '').match(/(\d+)\s*(\.|$)/);
    return match ? Number(match[1]) : null;
}

/**
 * @param {string} projectRoot the NestJS app directory
 * @param {{ pkgJson?: object, workspaceRoot?: string|null }} [options]
 *   pkgJson defaults to <projectRoot>/package.json; workspaceRoot adds the
 *   root package.json as a fallback for hoisted dev tools.
 */
function detectStack(projectRoot, { pkgJson, workspaceRoot = null } = {}) {
    const pkg = pkgJson || readJson(path.join(projectRoot, 'package.json')) || {};
    const rootPkg =
        workspaceRoot && path.resolve(workspaceRoot) !== path.resolve(projectRoot)
            ? readJson(path.join(workspaceRoot, 'package.json'))
            : null;
    const pkgs = [pkg, rootPkg].filter(Boolean);
    const scripts = pkg.scripts || {};

    const moduleType = pkg.type === 'module' ? 'esm' : 'cjs';

    // ESM resolution (nodenext + "type": "module") requires the extension.
    // CommonJS accepts both, so follow what the project already writes.
    let importStyle = 'bare';
    let importStyleSource = 'default';
    if (moduleType === 'esm') {
        importStyle = 'js';
        importStyleSource = 'package.json "type": "module"';
    } else {
        for (const probe of STYLE_PROBES) {
            const style = importStyleOf(readText(path.join(projectRoot, probe)));
            if (style) {
                importStyle = style;
                importStyleSource = probe.split(path.sep).join('/');
                break;
            }
        }
    }

    const testRunner = pickTool(TEST_RUNNERS, {
        script: scripts.test,
        pkgs,
        dir: projectRoot,
        configs: { jest: JEST_CONFIGS, vitest: VITEST_CONFIGS },
    });
    const linter = pickTool(LINTERS, {
        script: scripts.lint,
        pkgs,
        dir: projectRoot,
        configs: { eslint: ESLINT_CONFIGS, oxlint: OXLINT_CONFIGS },
    });

    const nestRange =
        (pkg.dependencies && pkg.dependencies['@nestjs/core']) ||
        (pkg.devDependencies && pkg.devDependencies['@nestjs/core']) ||
        (rootPkg && rootPkg.dependencies && rootPkg.dependencies['@nestjs/core']) ||
        null;

    return {
        moduleType,
        importStyle,
        importStyleSource,
        testRunner: testRunner.name,
        testRunnerSource: testRunner.source,
        jestConfig: firstExisting(projectRoot, JEST_CONFIGS),
        vitestConfig: firstExisting(projectRoot, VITEST_CONFIGS),
        linter: linter.name,
        linterSource: linter.source,
        nestMajor: readMajor(nestRange),
    };
}

/**
 * Writes a relative module specifier in the project's style:
 * withImportStyle('./prisma.service', stack) -> './prisma.service.js' (js style).
 * Package specifiers and paths that already have an extension are returned as is.
 */
function withImportStyle(specifier, stack) {
    if (!/^\.{1,2}\//.test(specifier)) return specifier;
    if (OTHER_EXT.test(specifier) || /\.(c|m)js$/.test(specifier)) return specifier;
    const bare = specifier.replace(/\.js$/, '');
    return stack && stack.importStyle === 'js' ? `${bare}.js` : bare;
}

/** One-line summary for the plan preview, e.g. "ESM · .js imports · Vitest · oxlint". */
function describeStack(stack) {
    const label = { jest: 'Jest', vitest: 'Vitest', eslint: 'ESLint', oxlint: 'oxlint' };
    return [
        stack.moduleType === 'esm' ? 'ESM' : 'CommonJS',
        stack.importStyle === 'js' ? '.js imports' : 'extensionless imports',
        stack.testRunner ? label[stack.testRunner] : 'no test runner',
        stack.linter ? label[stack.linter] : 'no linter',
    ].join(' · ');
}

module.exports = { detectStack, withImportStyle, describeStack, importStyleOf };
