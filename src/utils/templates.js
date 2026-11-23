const fs = require('fs');
const path = require('path');

const { renderStack, DEFAULT_STACK } = require('./variants');
const { describeStack } = require('./detectStack');

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

/**
 * Every file of one skill folder, relative to it, with forward slashes:
 * SKILL.md first, then supporting files (for example references/*.md) sorted.
 * The agent loads SKILL.md and opens the supporting files only when SKILL.md
 * points to them, so they keep the always-loaded part short.
 */
function listSkillFiles(name, templatesDir = TEMPLATES_DIR) {
    const root = path.join(templatesDir, 'skills', name);
    const files = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) walk(abs);
            else if (e.isFile()) files.push(path.relative(root, abs).split(path.sep).join('/'));
        }
    };
    walk(root);
    return files.sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)));
}

function readTemplate(rel, templatesDir = TEMPLATES_DIR) {
    return fs.readFileSync(path.join(templatesDir, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** A skill file rendered for the project stack (see utils/variants.js). */
function renderSkill(source, { stack = DEFAULT_STACK } = {}, name) {
    return renderStack(source, stack, name);
}

/** AGENTS.md points at the real skills folder of the chosen agent and names the stack. */
function renderAgentsMd(source, { skillsDir, stack = DEFAULT_STACK }) {
    return renderStack(source, stack, 'AGENTS.md').split('{{SKILLS_DIR}}').join(skillsDir).split('{{STACK}}').join(describeStack(stack));
}

/**
 * The index as a section of someone else's AGENTS.md: its title becomes a
 * level-2 heading and every other heading moves one level down, so it nests
 * under the file's own `# AGENTS.md`.
 */
function toIndexBlock(agentsMd) {
    let fenced = false;
    return agentsMd
        .split('\n')
        .map((line, i) => {
            if (/^```/.test(line)) fenced = !fenced;
            if (fenced) return line;
            if (i === 0 && /^# /.test(line)) return `## ${line.slice(2).replace(/^AGENTS\.md:\s*/, '')}`;
            return /^#{1,5} /.test(line) ? `#${line}` : line;
        })
        .join('\n')
        .replace(/\n+$/, '');
}

/** CLAUDE.md imports the index file, whichever name it ended up with. */
function renderClaudeMd(source, { indexFile }) {
    return source.split('@AGENTS.md').join(`@${indexFile}`);
}

module.exports = { TEMPLATES_DIR, listSkills, listSkillFiles, readTemplate, renderSkill, renderAgentsMd, toIndexBlock, renderClaudeMd };
