const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

/** Skill folders shipped in templates/skills, sorted. */
function listSkills(templatesDir = TEMPLATES_DIR) {
    const dir = path.join(templatesDir, 'skills');
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'SKILL.md')))
        .map((d) => d.name)
        .sort();
}

function readTemplate(rel, templatesDir = TEMPLATES_DIR) {
    return fs.readFileSync(path.join(templatesDir, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** AGENTS.md points at the real skills folder of the chosen agent. */
function renderAgentsMd(source, { skillsDir }) {
    return source.split('{{SKILLS_DIR}}').join(skillsDir);
}

/** CLAUDE.md imports the index file, whichever name it ended up with. */
function renderClaudeMd(source, { indexFile }) {
    return source.split('@AGENTS.md').join(`@${indexFile}`);
}

module.exports = { TEMPLATES_DIR, listSkills, readTemplate, renderAgentsMd, renderClaudeMd };
