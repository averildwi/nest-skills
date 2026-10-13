/**
 * Where each agent reads skills and project instructions.
 *
 * Sources (checked 2026-10-13):
 * - OpenCode, https://opencode.ai/docs/skills/ : project skills in
 *   `.opencode/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md` or
 *   `.agents/skills/<name>/SKILL.md`; names must be unique across locations.
 * - OpenCode, https://opencode.ai/docs/rules/ : project rules in `AGENTS.md`
 *   at the project root; `CLAUDE.md` is only a fallback when AGENTS.md is absent.
 * - Claude Code, https://code.claude.com/docs/en/skills : project skills in
 *   `.claude/skills/<name>/SKILL.md`.
 * - Claude Code, https://code.claude.com/docs/en/memory : reads `AGENTS.md`
 *   only when there is no `CLAUDE.md` (and only from v2.1.277); a `CLAUDE.md`
 *   that contains `@AGENTS.md` works in every version and setting.
 *
 * "both" installs one copy in `.claude/skills`, which both tools read, so the
 * same skill name never appears twice for OpenCode.
 */
const AGENTS = {
    opencode: {
        value: 'opencode',
        label: 'OpenCode',
        skillsDir: '.opencode/skills',
        claudeMd: false,
    },
    claude: {
        value: 'claude',
        label: 'Claude Code',
        skillsDir: '.claude/skills',
        claudeMd: true,
    },
    both: {
        value: 'both',
        label: 'OpenCode + Claude Code',
        skillsDir: '.claude/skills',
        claudeMd: true,
    },
};

/** Fallback index name when the project already has its own AGENTS.md. */
const FALLBACK_INDEX = 'AGENTS.nest-skills.md';
const MANIFEST_FILE = '.nest-skills.json';
/**
 * --force keeps the replaced file here, outside the skills folder, so the
 * printed `git add <skillsDir>` never stages a backup and OpenCode never sees one.
 */
const BACKUP_DIR = '.nest-skills-backup';

module.exports = { AGENTS, FALLBACK_INDEX, MANIFEST_FILE, BACKUP_DIR };
