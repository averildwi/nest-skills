const { withImportStyle } = require('./detectStack');

/**
 * Renders a template for the project stack, so the agent reads examples that
 * compile in this project (Vitest vs Jest, oxlint vs ESLint, `.js` imports).
 *
 * 1. Stack blocks, each marker on its own line:
 *      <!-- stack:vitest -->
 *      ...kept only when the project uses Vitest...
 *      <!-- /stack -->
 *    `<!-- stack:jest|eslint -->` keeps the block when any key matches.
 * 2. Vitest: `jest.fn(` / `jest.spyOn(` / `jest.Mock` become `vi.*` / `Mock`,
 *    and a TypeScript block that uses `Mock` gets `import type { Mock } from 'vitest'`.
 * 3. `.js` import style: relative specifiers get the `.js` suffix.
 *
 * The templates are written for Jest + ESLint + extensionless imports, so
 * that stack renders them unchanged apart from the blocks.
 */
const KEYS = {
    jest: (s) => s.testRunner !== 'vitest',
    vitest: (s) => s.testRunner === 'vitest',
    eslint: (s) => s.linter !== 'oxlint',
    oxlint: (s) => s.linter === 'oxlint',
    esm: (s) => s.moduleType === 'esm',
    cjs: (s) => s.moduleType !== 'esm',
    'imports-js': (s) => s.importStyle === 'js',
    'imports-bare': (s) => s.importStyle !== 'js',
};

const OPEN = /^<!-- stack:([a-z|-]+) -->$/;
const CLOSE = /^<!-- \/stack -->$/;
const FENCE = /^```/;
const TS_FENCE = /^```(ts|typescript)\s*$/;

/** The stack the templates are written for. */
const DEFAULT_STACK = Object.freeze({ moduleType: 'cjs', importStyle: 'bare', testRunner: 'jest', linter: 'eslint' });

function selectBlocks(source, stack, name = 'template') {
    const out = [];
    let keep = null; // null: outside a block
    source.split('\n').forEach((line, i) => {
        const open = line.match(OPEN);
        if (open) {
            if (keep !== null) throw new Error(`${name}:${i + 1}: nested stack block`);
            const keys = open[1].split('|');
            const unknown = keys.find((k) => !KEYS[k]);
            if (unknown) throw new Error(`${name}:${i + 1}: unknown stack key "${unknown}"`);
            keep = keys.some((k) => KEYS[k](stack));
            return;
        }
        if (CLOSE.test(line)) {
            if (keep === null) throw new Error(`${name}:${i + 1}: stack block closed but never opened`);
            keep = null;
            return;
        }
        if (keep !== false) out.push(line);
    });
    if (keep !== null) throw new Error(`${name}: stack block is not closed`);
    return out.join('\n');
}

function toVitest(text) {
    return text
        .replace(/\bjest\.fn\(/g, 'vi.fn(')
        .replace(/\bjest\.spyOn\(/g, 'vi.spyOn(')
        .replace(/\bjest\.Mock\b/g, 'Mock');
}

const RELATIVE_FROM = /(\bfrom\s+|^import\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"\n]+)\2/gm;
const QUOTED_SPEC = /`(['"])(\.{1,2}\/[^'"`\n]+)\1`/g;

function withJsImports(code, stack) {
    return code.replace(RELATIVE_FROM, (_m, lead, q, spec) => `${lead}${q}${withImportStyle(spec, stack)}${q}`);
}

/**
 * Adds an import after the last package import of a code block (before the
 * relative ones), or at the top when the block has no imports.
 */
function addImport(code, statement) {
    const lines = code.split('\n');
    let firstCode = -1;
    let lastPackageImport = -1;
    let firstImport = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*$/.test(line) || /^\s*\/\//.test(line)) continue;
        if (!/^import\b/.test(line)) {
            firstCode = i;
            break;
        }
        let end = i;
        while (!/;\s*$/.test(lines[end]) && end < lines.length - 1) end++;
        const text = lines.slice(i, end + 1).join('\n');
        if (firstImport < 0) firstImport = i;
        if (!/(from\s+|^import\s+)['"]\./.test(text)) lastPackageImport = end;
        i = end;
    }
    let at;
    if (lastPackageImport >= 0) at = lastPackageImport + 1;
    else if (firstImport >= 0) at = firstImport;
    else {
        // No imports: keep a leading `// path/to/file.ts` comment on top.
        at = 0;
        while (at < lines.length && /^\s*\/\//.test(lines[at])) at++;
        if (firstCode >= 0 && firstCode < at) at = firstCode;
    }
    lines.splice(at, 0, statement);
    return lines.join('\n');
}

function renderCode(code, stack) {
    let out = code;
    if (stack.testRunner === 'vitest') {
        out = toVitest(out);
        if (/\bMock\b/.test(out) && !/import\s+(type\s+)?\{[^}]*\bMock\b[^}]*\}\s+from\s+['"]vitest['"]/.test(out)) {
            out = addImport(out, "import type { Mock } from 'vitest';");
        }
    }
    if (stack.importStyle === 'js') out = withJsImports(out, stack);
    return out;
}

function renderProse(text, stack) {
    let out = text;
    if (stack.testRunner === 'vitest') out = toVitest(out);
    if (stack.importStyle === 'js') {
        out = out.replace(QUOTED_SPEC, (_m, q, spec) => `\`${q}${withImportStyle(spec, stack)}${q}\``);
    }
    return out;
}

function renderStack(source, stack = DEFAULT_STACK, name) {
    const lines = selectBlocks(source, stack, name).split('\n');
    const out = [];
    let prose = [];
    let code = null; // lines of the open fence, including the opening line
    const flushProse = () => {
        if (prose.length) out.push(renderProse(prose.join('\n'), stack));
        prose = [];
    };
    for (const line of lines) {
        if (code) {
            if (FENCE.test(line)) {
                const [open, ...body] = code;
                out.push(open);
                if (body.length) out.push(TS_FENCE.test(open) ? renderCode(body.join('\n'), stack) : body.join('\n'));
                out.push(line);
                code = null;
            } else {
                code.push(line);
            }
            continue;
        }
        if (FENCE.test(line)) {
            flushProse();
            code = [line];
            continue;
        }
        prose.push(line);
    }
    if (code) throw new Error(`${name || 'template'}: code block is not closed`);
    flushProse();
    return out.join('\n');
}

module.exports = { renderStack, selectBlocks, addImport, DEFAULT_STACK, STACK_KEYS: Object.keys(KEYS) };
