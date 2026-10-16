const { decideFile, applyDecisions, record } = require('./decide');
const { listSkills, listSkillFiles, readTemplate } = require('../utils/templates');

/**
 * Copies every file of templates/skills/<name>/ (SKILL.md plus supporting
 * files such as references/*.md) into <skillsDir>/<name>/. Each file is
 * tracked on its own, so edit protection works per file.
 */
module.exports = {
    id: 'skills',
    title: 'Install skills',

    async plan(ctx) {
        const decisions = [];
        for (const name of listSkills(ctx.templatesDir)) {
            for (const file of listSkillFiles(name, ctx.templatesDir)) {
                const relPath = `${ctx.skillsDir}/${name}/${file}`;
                decisions.push(await decideFile(ctx, relPath, readTemplate(`skills/${name}/${file}`, ctx.templatesDir)));
            }
        }
        record(ctx, decisions);
        return { entries: decisions.map((d) => d.entry), data: { decisions } };
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
