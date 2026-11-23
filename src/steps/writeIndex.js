const path = require('path');

const fsx = require('../utils/fsHelpers');
const { INDEX_BLOCK_KEY } = require('../config/agents');
const { decideFile, decideState, applyDecisions, record } = require('./decide');
const { readTemplate, renderAgentsMd, toIndexBlock } = require('../utils/templates');
const { findBlock, readBlock, writeBlock } = require('../utils/indexBlock');

/**
 * Picks where the index goes:
 *   - no AGENTS.md yet, or one nest-skills wrote -> the whole AGENTS.md ("file")
 *   - the project's own AGENTS.md (for example the one `nest new` writes)
 *     -> a marked block inside it ("block"); the user's text is never touched
 *   - an install made before blocks existed, with its index in
 *     AGENTS.nest-skills.md -> keeps that file, so nothing moves under the user
 */
async function resolveIndex(ctx) {
    const m = ctx.manifest;
    if (m && m.indexFile && m.indexFile !== 'AGENTS.md') return { file: m.indexFile, mode: 'file' };
    const abs = path.join(ctx.projectRoot, 'AGENTS.md');
    if (!(await fsx.exists(abs))) return { file: 'AGENTS.md', mode: 'file' };
    if (m && m.indexMode === 'block') return { file: 'AGENTS.md', mode: 'block' };
    if (m && m.files['AGENTS.md'] !== undefined) return { file: 'AGENTS.md', mode: 'file' };
    const source = await fsx.readText(abs);
    if (findBlock(source)) return { file: 'AGENTS.md', mode: 'block' };
    // Same content as ours (for example a copy made by hand): adopt it.
    if (fsx.hash(source) === fsx.hash(renderIndex(ctx))) return { file: 'AGENTS.md', mode: 'file' };
    return { file: 'AGENTS.md', mode: 'block' };
}

function renderIndex(ctx) {
    return renderAgentsMd(readTemplate('AGENTS.md', ctx.templatesDir), ctx);
}

async function planFile(ctx) {
    const decision = await decideFile(ctx, ctx.indexFile, renderIndex(ctx), { protect: true, followsConfig: true, followsStack: true });
    record(ctx, [decision]);
    const entries = [decision.entry];
    if (ctx.indexFile !== 'AGENTS.md') {
        const own = await fsx.readText(path.join(ctx.projectRoot, 'AGENTS.md')).catch(() => '');
        if (own.includes(ctx.indexFile)) {
            entries.push({ kind: 'skip', label: 'AGENTS.md', reason: `yours, already links ${ctx.indexFile}` });
        } else {
            entries.push({
                kind: 'warn',
                label: 'AGENTS.md',
                reason: `yours, left untouched. Add a line pointing to ${ctx.indexFile} (see summary)`,
            });
            ctx.linkHint = true;
        }
    }
    return { entries, data: { decisions: [decision] } };
}

async function planBlock(ctx) {
    const relPath = 'AGENTS.md';
    const abs = path.join(ctx.projectRoot, relPath);
    const source = await fsx.readText(abs);
    const body = toIndexBlock(renderIndex(ctx));
    const state = decideState(
        ctx,
        { key: INDEX_BLOCK_KEY, label: `${relPath} (nest-skills block)`, current: readBlock(source) ?? undefined, desired: body },
        {
            followsConfig: true,
            followsStack: true,
            keepRemoved: true,
            removedReason: 'you removed the nest-skills block, not added again (use --force to add it back)',
        },
    );
    const decision = { ...state, relPath, abs, recordKey: INDEX_BLOCK_KEY };
    if (state.action === 'write') {
        decision.content = writeBlock(source, body);
        decision.fileKind = 'modify';
        if (state.entry.kind === 'create') state.entry.reason = 'added to your AGENTS.md, your text is kept as is';
    }
    record(ctx, [decision]);
    return { entries: [decision.entry], data: { decisions: [decision] } };
}

module.exports = {
    id: 'index',
    title: 'Write the AGENTS.md index',
    resolveIndex,

    async plan(ctx) {
        const { file, mode } = await resolveIndex(ctx);
        ctx.indexFile = file;
        ctx.indexMode = mode;
        return mode === 'block' ? planBlock(ctx) : planFile(ctx);
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
