const { CancelledError, CliError } = require('./errors');
const { AGENTS } = require('./config/agents');

async function prompt(questions) {
    // inquirer 9 is ESM-only, so it has to be loaded with a dynamic import.
    const { default: inquirer } = await import('inquirer');
    try {
        return await inquirer.prompt(questions);
    } catch (err) {
        if (err && (err.name === 'ExitPromptError' || /force closed/i.test(err.message || ''))) {
            throw new CancelledError();
        }
        throw err;
    }
}

/**
 * Decides the agent target. Priority: --agent, then the manifest of a previous
 * install, then a prompt. Without a TTY (or with --yes) there is no prompt.
 */
async function resolveAgent(options, { interactive, manifest }) {
    if (options.agent) return options.agent;
    if (manifest && AGENTS[manifest.agent]) return manifest.agent;

    if (options.command === 'update') {
        throw new CliError('No previous install found (.nest-skills.json is missing).', {
            hints: ['Run "npx @averildwi/nest-skills --agent <opencode|claude|both>" first.'],
            exitCode: 2,
        });
    }
    if (!interactive) {
        throw new CliError('Choose an agent with --agent when running non-interactively.', {
            hints: [
                `Supported values: ${Object.keys(AGENTS).join(', ')}.`,
                'Example: npx @averildwi/nest-skills --agent opencode --yes',
            ],
            exitCode: 2,
        });
    }

    const { agent } = await prompt([
        {
            type: 'list',
            name: 'agent',
            message: 'Which AI agent should read these skills?',
            choices: Object.values(AGENTS).map((a) => ({ name: `${a.label}  (${a.skillsDir})`, value: a.value })),
        },
    ]);
    return agent;
}

async function confirmPlan() {
    const { proceed } = await prompt([
        { type: 'confirm', name: 'proceed', message: 'Apply these changes?', default: true },
    ]);
    if (!proceed) throw new CancelledError();
}

module.exports = { resolveAgent, confirmPlan };
