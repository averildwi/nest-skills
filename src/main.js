const pkg = require('../package.json');
const { parseCliArgs, helpText } = require('./cli');
const { setColorEnabled } = require('./ui/colors');
const ui = require('./ui/output');
const { runPreflight } = require('./preflight');
const { resolveAgent, confirmPlan } = require('./prompts');
const { readManifest } = require('./utils/manifest');
const runner = require('./runner');

async function main(argv, { cwd = process.cwd(), isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY) } = {}) {
    const options = parseCliArgs(argv);
    if (options.color !== undefined) setColorEnabled(options.color);

    if (options.help) {
        process.stdout.write(helpText(pkg));
        return;
    }
    if (options.version) {
        process.stdout.write(`${pkg.version}\n`);
        return;
    }

    const interactive = isTTY && !options.yes;
    ui.header('nest-skills', `v${pkg.version}`);

    runPreflight(cwd);
    const manifest = readManifest(cwd);
    const agent = await resolveAgent(options, { interactive, manifest });

    const ctx = runner.buildContext({ projectRoot: cwd, pkg, options, agent, manifest });
    const plan = await runner.buildPlan(ctx);
    runner.printPlan(ctx, plan, { dryRun: options.dryRun });

    if (!plan.some((p) => p.actionable)) {
        ui.out();
        ui.success('Everything is already installed. Nothing to do.');
        runner.printSummary(ctx, plan, { files: [] });
        return;
    }
    if (options.dryRun) {
        ui.out();
        ui.info('Dry run complete. Re-run without --dry-run to apply these changes.');
        ui.out();
        return;
    }

    ui.out();
    if (interactive) await confirmPlan();

    const summary = await runner.executePlan(ctx, plan);
    runner.printSummary(ctx, plan, summary);
}

module.exports = { main };
