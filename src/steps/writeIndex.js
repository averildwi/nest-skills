const path = require('path');

const fsx = require('../utils/fsHelpers');
const { FALLBACK_INDEX } = require('../config/agents');
const { decideFile, applyDecisions, record } = require('./decide');
const { readTemplate, renderAgentsMd } = require('../utils/templates');

/**
 * Picks where the index goes. The project's own AGENTS.md is never touched:
 * if one exists that nest-skills did not write, the index goes to
 * AGENTS.nest-skills.md and the user is told to link it.
 */
async function resolveIndexFile(ctx) {
    if (ctx.manifest && ctx.manifest.indexFile) return ctx.manifest.indexFile;
    const own = path.join(ctx.projectRoot, 'AGENTS.md');
    if (!(await fsx.exists(own))) return 'AGENTS.md';
    const desired = renderAgentsMd(readTemplate('AGENTS.md', ctx.templatesDir), ctx);
    // Same content as ours (for example a copy made by hand): adopt it.
    if (fsx.hash(await fsx.readText(own)) === fsx.hash(desired)) return 'AGENTS.md';
    return FALLBACK_INDEX;
}

module.exports = {
    id: 'index',
    title: 'Write the AGENTS.md index',
    resolveIndexFile,

    async plan(ctx) {
        ctx.indexFile = await resolveIndexFile(ctx);
        const desired = renderAgentsMd(readTemplate('AGENTS.md', ctx.templatesDir), ctx);
        const decision = await decideFile(ctx, ctx.indexFile, desired, { protect: true });
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
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
