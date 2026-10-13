const { parseArgs } = require('util');

const { CliError } = require('./errors');
const { AGENTS } = require('./config/agents');

const COMMANDS = ['install', 'update'];

const OPTIONS = {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    yes: { type: 'boolean', short: 'y' },
    'dry-run': { type: 'boolean' },
    force: { type: 'boolean' },
    agent: { type: 'string', short: 'a' },
    dir: { type: 'string' },
    color: { type: 'boolean' },
    'no-color': { type: 'boolean' },
};

/**
 * Parses argv into a normalised options object. Unspecified options stay
 * `undefined` so the caller can prompt or fall back to the manifest.
 */
function parseCliArgs(argv = process.argv.slice(2)) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (err) {
        throw new CliError(err.message.replace(/\. To specify.*$/s, '.'), {
            hints: ['Run "nest-skills --help" to see all available options.'],
            exitCode: 2,
        });
    }

    const v = parsed.values;
    const [command = 'install', ...extra] = parsed.positionals;
    if (!COMMANDS.includes(command)) {
        throw new CliError(`Unknown command "${command}".`, {
            hints: [`Supported commands: ${COMMANDS.join(', ')}.`],
            exitCode: 2,
        });
    }
    if (extra.length) {
        throw new CliError(`Unexpected argument "${extra[0]}".`, { exitCode: 2 });
    }

    let agent;
    if (v.agent !== undefined) {
        agent = v.agent.toLowerCase();
        if (!AGENTS[agent]) {
            throw new CliError(`Unknown agent "${v.agent}".`, {
                hints: [`Supported values: ${Object.keys(AGENTS).join(', ')}.`],
                exitCode: 2,
            });
        }
    }

    let dir;
    if (v.dir !== undefined) {
        dir = v.dir.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
        if (!dir || dir.startsWith('/') || /^[a-z]:/i.test(dir) || dir.split('/').includes('..')) {
            throw new CliError(`Invalid --dir "${v.dir}".`, {
                hints: ['Use a path relative to the project root, inside the project, e.g. --dir .agents/skills'],
                exitCode: 2,
            });
        }
    }

    return {
        command,
        help: Boolean(v.help),
        version: Boolean(v.version),
        yes: Boolean(v.yes),
        dryRun: Boolean(v['dry-run']),
        force: Boolean(v.force),
        agent,
        dir,
        color: v['no-color'] ? false : v.color ? true : undefined,
    };
}

function helpText(pkg) {
    return `
  ${pkg.name} v${pkg.version}
  Install the NestJS + Prisma coding standards as agent skills and an AGENTS.md index.

  Usage
    $ npx ${pkg.name} [install] [options]
    $ npx ${pkg.name} update [options]

  Commands
    install            Add missing skills and the index (default). Never overwrites your edits.
    update             Also refresh files you have not edited to the bundled version.

  Options
    -a, --agent <name> opencode | claude | both (update: default from .nest-skills.json)
                         opencode -> .opencode/skills + AGENTS.md
                         claude   -> .claude/skills + AGENTS.md + CLAUDE.md (imports AGENTS.md)
                         both     -> .claude/skills (read by both tools) + AGENTS.md + CLAUDE.md
    --dir <path>       Install skills somewhere else (relative to the project root)
    --force            Overwrite files you edited or wrote yourself (a .bak copy is kept)
    -y, --yes          Skip prompts and the confirmation
    --dry-run          Show the plan without writing anything
    --no-color         Disable coloured output
    -v, --version      Print the version
    -h, --help         Show this help

  Examples
    $ npx ${pkg.name} --agent opencode
    $ npx ${pkg.name} --agent both --yes
    $ npx ${pkg.name} update --dry-run
`;
}

module.exports = { parseCliArgs, helpText, COMMANDS };
