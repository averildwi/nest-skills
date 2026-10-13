const { decideFile, applyDecisions, record } = require('./decide');
const { listSkills, readTemplate } = require('../utils/templates');

/** Copies every templates/skills/<name>/SKILL.md into <skillsDir>/<name>/SKILL.md. */
module.exports = {
    id: 'skills',
    title: 'Install skills',

    async plan(ctx) {
        const decisions = [];
        for (const name of listSkills(ctx.templatesDir)) {
            const relPath = `${ctx.skillsDir}/${name}/SKILL.md`;
            decisions.push(await decideFile(ctx, relPath, readTemplate(`skills/${name}/SKILL.md`, ctx.templatesDir)));
        }
        record(ctx, decisions);
        return { entries: decisions.map((d) => d.entry), data: { decisions } };
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
