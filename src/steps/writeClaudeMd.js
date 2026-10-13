const path = require('path');

const fsx = require('../utils/fsHelpers');
const { decideFile, applyDecisions, record } = require('./decide');
const { readTemplate, renderClaudeMd } = require('../utils/templates');

/**
 * Claude Code reads CLAUDE.md and ignores AGENTS.md whenever a CLAUDE.md
 * exists, so it gets a thin CLAUDE.md that imports the index. An existing
 * CLAUDE.md of the user is never edited; we only report whether it already
 * imports the index.
 */
module.exports = {
    id: 'claude-md',
    title: 'Write CLAUDE.md for Claude Code',

    async plan(ctx) {
        if (!ctx.agent.claudeMd) return { entries: [] };
        const desired = renderClaudeMd(readTemplate('CLAUDE.md', ctx.templatesDir), ctx);
        const decision = await decideFile(ctx, 'CLAUDE.md', desired, { protect: true, followsConfig: true });
        record(ctx, [decision]);

        if (decision.foreign) {
            const source = await fsx.readText(path.join(ctx.projectRoot, 'CLAUDE.md'));
            const imports = source.split(/\r?\n/).some((l) => l.trim() === `@${ctx.indexFile}`);
            decision.entry = imports
                ? { kind: 'skip', label: 'CLAUDE.md', reason: `yours, already imports @${ctx.indexFile}` }
                : { kind: 'warn', label: 'CLAUDE.md', reason: `yours, left untouched. Add "@${ctx.indexFile}" as its first line` };
            if (!imports) ctx.claudeImportHint = true;
        }
        return { entries: [decision.entry], data: { decisions: [decision] } };
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
