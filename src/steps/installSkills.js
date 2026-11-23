const { decideFile, applyDecisions, record } = require('./decide');
const { listSkills, listSkillFiles, readTemplate, renderSkill } = require('../utils/templates');

/**
 * Copies every file of templates/skills/<name>/ (SKILL.md plus supporting
 * files such as references/*.md) into <skillsDir>/<name>/, rendered for the
 * detected stack. Each file is tracked on its own, so edit protection works per file.
 */
module.exports = {
    id: 'skills',
    title: 'Install skills',

    async plan(ctx) {
        const decisions = [];
        for (const name of listSkills(ctx.templatesDir)) {
            for (const file of listSkillFiles(name, ctx.templatesDir)) {
                const relPath = `${ctx.skillsDir}/${name}/${file}`;
                const rel = `skills/${name}/${file}`;
                const desired = renderSkill(readTemplate(rel, ctx.templatesDir), ctx, rel);
                decisions.push(await decideFile(ctx, relPath, desired, { followsStack: true }));
            }
        }
        record(ctx, decisions);
        return { entries: decisions.map((d) => d.entry), data: { decisions } };
    },

    async run(ctx, { decisions }) {
        return { files: await applyDecisions(decisions, ctx) };
    },
};
