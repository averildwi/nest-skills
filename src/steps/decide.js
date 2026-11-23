const path = require('path');

const fsx = require('../utils/fsHelpers');
const { BACKUP_DIR } = require('../config/agents');

/**
 * Folder for the --force backups of this run, e.g.
 * .nest-skills-backup/2026-10-13T08-30-00. Outside the skills folder so the
 * agent never loads a backup and `git add <skillsDir>` never stages one.
 */
function backupRoot(ctx) {
    if (!ctx.backupRoot) {
        const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
        ctx.backupRoot = `${BACKUP_DIR}/${stamp}`;
    }
    return ctx.backupRoot;
}

/**
 * Decides what to do with one managed file. Pure: reads, never writes.
 *
 * States, with `recorded` = hash stored in .nest-skills.json at the last write:
 *   missing                                  -> create
 *   current == desired                       -> skip (up to date)
 *   not recorded (the user's own file)       -> skip; --force replaces it (backup kept),
 *                                               unless options.protect (AGENTS.md / CLAUDE.md)
 *   current != recorded (edited by the user) -> skip; --force overwrites it (backup kept)
 *   current == recorded, desired is newer    -> install: skip ("run update"); update: overwrite
 *
 * Returns { action, entry, recordHash } where `recordHash` is what the new
 * manifest should store for this path (undefined = do not track it).
 */
async function decideFile(ctx, relPath, desired, options = {}) {
    const abs = path.join(ctx.projectRoot, relPath);
    const current = (await fsx.exists(abs)) ? await fsx.readText(abs) : undefined;
    return { relPath, abs, desired, ...decideState(ctx, { key: relPath, label: relPath, current, desired }, options) };
}

/**
 * The state machine of decideFile, for any piece of content tracked under
 * `key` in the manifest (a whole file, or the nest-skills block of AGENTS.md).
 * `current` is undefined when the content does not exist yet.
 *
 * options.keepRemoved: content that was recorded but is now gone is not added
 * again without --force (the user removed it on purpose).
 */
function decideState(ctx, { key, label, current, desired }, options = {}) {
    const desiredHash = fsx.hash(desired);
    const recorded = ctx.manifest ? ctx.manifest.files[key] : undefined;

    if (current === undefined) {
        if (options.keepRemoved && recorded !== undefined && !ctx.force) {
            return {
                action: 'none',
                entry: { kind: 'warn', label, reason: options.removedReason || 'removed by you, not added again (use --force to add it)' },
                recordHash: recorded,
                removed: true,
            };
        }
        return { action: 'write', entry: { kind: 'create', label }, recordHash: desiredHash };
    }

    const currentHash = fsx.hash(current);
    if (currentHash === desiredHash) {
        return { action: 'none', entry: { kind: 'skip', label, reason: 'up to date' }, recordHash: desiredHash };
    }

    if (recorded === undefined) {
        // Skill files may be adopted with --force (backup kept). The user's own
        // AGENTS.md / CLAUDE.md are never overwritten; those steps pass protect.
        if (ctx.force && !options.protect) {
            return {
                action: 'write',
                backup: true,
                entry: { kind: 'modify', label, reason: `not written by nest-skills, overwritten by --force, backup in ${BACKUP_DIR}/` },
                recordHash: desiredHash,
            };
        }
        return {
            action: 'none',
            entry: {
                kind: 'warn',
                label,
                reason: options.protect
                    ? 'exists and was not written by nest-skills, left untouched'
                    : 'exists and was not written by nest-skills, left untouched (use --force to replace it)',
            },
            recordHash: undefined,
            foreign: true,
        };
    }

    if (currentHash !== recorded) {
        if (ctx.force) {
            return {
                action: 'write',
                backup: true,
                entry: { kind: 'modify', label, reason: `edited by you, overwritten by --force, backup in ${BACKUP_DIR}/` },
                recordHash: desiredHash,
            };
        }
        return {
            action: 'none',
            entry: { kind: 'warn', label, reason: 'edited by you, kept (use --force to overwrite)' },
            recordHash: recorded,
            edited: true,
        };
    }

    // options.followsConfig: the content is rendered from the agent/folder
    // (AGENTS.md, CLAUDE.md). options.followsStack: it is rendered for the
    // detected stack (skills, AGENTS.md). A change of either refreshes the
    // unedited content on `install`; otherwise only `update` refreshes it.
    const configRefresh = ctx.configChanged && options.followsConfig;
    const stackRefresh = ctx.stackChanged && options.followsStack;
    if (ctx.command === 'update' || configRefresh || stackRefresh) {
        const reason = ctx.command === 'update' ? 'newer version' : configRefresh ? 'agent or folder changed' : 'project stack changed';
        return { action: 'write', entry: { kind: 'modify', label, reason }, recordHash: desiredHash };
    }
    return {
        action: 'none',
        entry: { kind: 'skip', label, reason: 'newer version available, run "nest-skills update"' },
        recordHash: recorded,
        outdated: true,
    };
}

/**
 * Applies the decisions of one step. Returns the changed files for the summary.
 * A decision may carry `content` (written as is, line endings kept) instead
 * of `desired` (written with LF).
 */
async function applyDecisions(decisions, ctx) {
    const files = [];
    for (const d of decisions) {
        if (d.action !== 'write') continue;
        if (d.backup) await writeBackup(ctx, d);
        if (d.content !== undefined) await fsx.writeRaw(d.abs, d.content);
        else await fsx.writeText(d.abs, d.desired);
        const kind = d.fileKind || d.entry.kind;
        ctx.ui.success(`${kind === 'create' ? 'Created' : 'Updated'} ${d.relPath}`);
        files.push({ kind, path: d.relPath });
    }
    return files;
}

async function writeBackup(ctx, d) {
    const relBackup = `${backupRoot(ctx)}/${d.relPath}`;
    // Ignores the whole backup folder without touching the project's .gitignore.
    const ignore = path.join(ctx.projectRoot, BACKUP_DIR, '.gitignore');
    if (!(await fsx.exists(ignore))) await fsx.writeText(ignore, '*\n');
    await fsx.writeRaw(path.join(ctx.projectRoot, relBackup), await fsx.readText(d.abs));
    (ctx.backups || (ctx.backups = [])).push(relBackup);
}

/** Remembers what the manifest step must store. */
function record(ctx, decisions) {
    for (const d of decisions) {
        if (d.recordHash) ctx.nextFiles[d.recordKey || d.relPath] = d.recordHash;
    }
}

module.exports = { decideFile, decideState, applyDecisions, record };
