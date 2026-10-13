const fs = require('fs');
const path = require('path');

const ui = require('./ui/output');
const { colors: c } = require('./ui/colors');
const { CliError } = require('./errors');
const { AGENTS, MANIFEST_FILE, BACKUP_DIR } = require('./config/agents');
const { TEMPLATES_DIR } = require('./utils/templates');
const steps = require('./steps');

function buildContext({ projectRoot, pkg, options, agent, manifest, templatesDir = TEMPLATES_DIR, out = ui }) {
    const agentDef = AGENTS[agent];
    // --dir wins; otherwise keep the folder of a previous install of the same agent.
    const skillsDir =
        options.dir ||
        (manifest && manifest.agent === agent && manifest.skillsDir) ||
        agentDef.skillsDir;
    return {
        projectRoot,
        pkg,
        command: options.command,
        force: options.force,
        agent: agentDef,
        skillsDir,
        manifest,
        // A different agent or folder than last time: files that depend on it
        // (AGENTS.md, CLAUDE.md) may be rewritten if the user has not edited them.
        configChanged: Boolean(manifest && (manifest.agent !== agent || manifest.skillsDir !== skillsDir)),
        previousSkillsDir: manifest && manifest.skillsDir !== skillsDir ? manifest.skillsDir : undefined,
        templatesDir,
        indexFile: 'AGENTS.md',
        nextFiles: {},
        ui: out,
    };
}

const ACTIONABLE = new Set(['create', 'modify']);

/** Asks every step what it would do. Never writes. */
async function buildPlan(ctx) {
    const plan = [];
    for (const step of steps) {
        const { entries, data } = await step.plan(ctx);
        plan.push({ step, entries, data, actionable: entries.some((e) => ACTIONABLE.has(e.kind)) });
    }
    return plan;
}

const KIND_STYLE = {
    create: (t) => `${c.green('+')} ${t}`,
    modify: (t) => `${c.yellow('~')} ${t}`,
    warn: (t) => `${c.yellow('!')} ${t}`,
    skip: (t) => `${c.gray('-')} ${c.gray(t)}`,
};

function printPlan(ctx, plan, { dryRun }) {
    ui.section('Configuration');
    ui.keyValues([
        ['Project', path.basename(ctx.projectRoot)],
        ['Command', ctx.command],
        ['Agent', ctx.agent.label],
        ['Skills folder', ctx.skillsDir],
        ['Index', ctx.indexFile],
    ]);
    ui.section(dryRun ? 'Planned changes (dry run, nothing will be written)' : 'Planned changes');
    for (const { entries } of plan) {
        for (const e of entries) {
            const reason = e.reason ? c.gray(` (${e.reason})`) : '';
            ui.out(`    ${KIND_STYLE[e.kind](e.label)}${reason}`);
        }
    }
}

/** Runs the actionable steps in order. On failure, says what was already written. */
async function executePlan(ctx, plan) {
    const actionable = plan.filter((p) => p.actionable);
    const files = [];
    for (const [i, item] of actionable.entries()) {
        ui.step(i + 1, actionable.length, item.step.title);
        try {
            const result = (await item.step.run(ctx, item.data || {})) || {};
            if (result.files) files.push(...result.files);
        } catch (err) {
            const failure = err instanceof CliError ? err : new CliError(err.message || String(err), { cause: err });
            failure.hints = [
                ...failure.hints,
                ...(files.length ? [`Files already written: ${files.map((f) => f.path).join(', ')}.`] : []),
                'It is safe to fix the problem and run the command again.',
            ];
            failure.failedStep = item.step.title;
            throw failure;
        }
    }
    return { files };
}

function collectNotes(plan) {
    const entries = plan.flatMap((p) => p.entries);
    return {
        edited: entries.filter((e) => e.kind === 'warn' && /edited by you/.test(e.reason || '')).map((e) => e.label),
        foreign: entries.filter((e) => e.kind === 'warn' && /not written by nest-skills/.test(e.reason || '')).map((e) => e.label),
        outdated: entries.filter((e) => /newer version available/.test(e.reason || '')).map((e) => e.label),
    };
}

function printSummary(ctx, plan, summary) {
    const notes = collectNotes(plan);
    ui.out();
    ui.out(`  ${c.green(c.bold('Skills are installed.'))}`);

    if (summary.files.length) {
        ui.section('Changed files');
        for (const f of summary.files) ui.out(`    ${KIND_STYLE[f.kind](f.path)}`);
    }
    printNotes(ctx, notes);
    printNextSteps(ctx, summary);
}

function printNotes(ctx, notes) {
    if (notes.edited.length) {
        ui.section('Kept your edits');
        for (const f of notes.edited) ui.out(`    ${c.yellow('!')} ${f}`);
        ui.out(c.gray(`    Re-run with --force to replace them with the bundled version (old copy kept in ${BACKUP_DIR}/).`));
    }
    if (ctx.backups && ctx.backups.length) {
        ui.section('Backups of replaced files');
        for (const f of ctx.backups) ui.out(`    ${c.gray('-')} ${f}`);
        ui.out(c.gray(`    ${BACKUP_DIR}/ ignores itself in git. Delete it once you no longer need the copies.`));
    }
    if (notes.foreign.length) {
        ui.section('Left your own files untouched');
        for (const f of notes.foreign) ui.out(`    ${c.yellow('!')} ${f}`);
    }
    if (notes.outdated.length) {
        ui.section('Updates available');
        ui.out(`    ${notes.outdated.length} file(s) can be refreshed with ${c.cyan('npx @averildwi/nest-skills update')}`);
    }
    if (ctx.linkHint) {
        ui.section('Link the index from your AGENTS.md');
        ui.out(`    Your AGENTS.md was kept. Add this line to it so the agent finds the standards:`);
        ui.out(`    ${c.cyan(`Read ${ctx.indexFile} before writing NestJS code and follow it.`)}`);
    }
    if (ctx.claudeImportHint) {
        ui.section('Link the index from your CLAUDE.md');
        ui.out(`    Add ${c.cyan(`@${ctx.indexFile}`)} as the first line of CLAUDE.md so Claude Code loads it.`);
    }
    if (ctx.previousSkillsDir && fs.existsSync(path.join(ctx.projectRoot, ctx.previousSkillsDir))) {
        ui.section('Old skills folder still present');
        ui.out(`    The previous install used ${c.cyan(ctx.previousSkillsDir)}. It was not deleted.`);
        ui.out(`    OpenCode reads several skill folders and needs unique names, so remove the old copies yourself:`);
        ui.out(`    ${c.cyan(`git rm -r ${ctx.previousSkillsDir}`)}  ${c.gray('(or delete the folder if it is not committed)')}`);
    }
}

function printNextSteps(ctx, summary) {
    ui.section('Next steps');
    const tracked = [ctx.indexFile, ctx.skillsDir, MANIFEST_FILE];
    if (ctx.agent.claudeMd && ctx.nextFiles['CLAUDE.md']) tracked.splice(1, 0, 'CLAUDE.md');
    ui.out(`    ${c.cyan('1.')} Commit the generated files on their own (see the git-workflow skill):`);
    ui.out(`       ${c.cyan(`git add ${tracked.join(' ')}`)}`);
    ui.out(`       ${c.cyan('git commit -m "chore: add agent skills"')}`);
    ui.out(`    ${c.cyan('2.')} Start a new ${ctx.agent.label} session in this folder so it picks up the skills.`);
    if (!summary.files.length) ui.out(c.gray('    (Nothing was written this time.)'));
    ui.out();
}

module.exports = { buildContext, buildPlan, printPlan, executePlan, printSummary, collectNotes };
