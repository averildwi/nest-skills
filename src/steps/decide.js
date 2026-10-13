const path = require('path');

const fsx = require('../utils/fsHelpers');

/**
 * Decides what to do with one managed file. Pure: reads, never writes.
 *
 * States, with `recorded` = hash stored in .nest-skills.json at the last write:
 *   missing                                  -> create
 *   current == desired                       -> skip (up to date)
 *   not recorded (the user's own file)       -> skip, never overwritten (even with --force)
 *   current != recorded (edited by the user) -> skip; --force overwrites and keeps a .bak
 *   current == recorded, desired is newer    -> install: skip ("run update"); update: overwrite
 *
 * Returns { action, entry, recordHash } where `recordHash` is what the new
 * manifest should store for this path (undefined = do not track it).
 */
async function decideFile(ctx, relPath, desired) {
    return { relPath, ...(await decideInner(ctx, relPath, desired)) };
}

async function decideInner(ctx, relPath, desired) {
    const abs = path.join(ctx.projectRoot, relPath);
    const desiredHash = fsx.hash(desired);
    const recorded = ctx.manifest ? ctx.manifest.files[relPath] : undefined;

    if (!(await fsx.exists(abs))) {
        return { action: 'write', abs, relPath, desired, entry: { kind: 'create', label: relPath }, recordHash: desiredHash };
    }

    const currentHash = fsx.hash(await fsx.readText(abs));
    if (currentHash === desiredHash) {
        return { action: 'none', entry: { kind: 'skip', label: relPath, reason: 'up to date' }, recordHash: desiredHash };
    }

    if (recorded === undefined) {
        return {
            action: 'none',
            entry: { kind: 'warn', label: relPath, reason: 'exists and was not written by nest-skills, left untouched' },
            recordHash: undefined,
            foreign: true,
        };
    }

    if (currentHash !== recorded) {
        if (ctx.force) {
            return {
                action: 'write',
                backup: true,
                abs,
                relPath,
                desired,
                entry: { kind: 'modify', label: relPath, reason: 'edited by you, overwritten by --force, backup .bak' },
                recordHash: desiredHash,
            };
        }
        return {
            action: 'none',
            entry: { kind: 'warn', label: relPath, reason: 'edited by you, kept (use --force to overwrite)' },
            recordHash: recorded,
            edited: true,
        };
    }

    if (ctx.command === 'update' || ctx.configChanged) {
        const reason = ctx.command === 'update' ? 'newer version' : 'agent or folder changed';
        return { action: 'write', abs, relPath, desired, entry: { kind: 'modify', label: relPath, reason }, recordHash: desiredHash };
    }
    return {
        action: 'none',
        entry: { kind: 'skip', label: relPath, reason: 'newer version available, run "nest-skills update"' },
        recordHash: recorded,
        outdated: true,
    };
}

/** Applies the decisions of one step. Returns the changed files for the summary. */
async function applyDecisions(decisions, ui) {
    const files = [];
    for (const d of decisions) {
        if (d.action !== 'write') continue;
        if (d.backup) await fsx.writeText(`${d.abs}.bak`, await fsx.readText(d.abs));
        await fsx.writeText(d.abs, d.desired);
        ui.success(`${d.entry.kind === 'create' ? 'Created' : 'Updated'} ${d.relPath}`);
        files.push({ kind: d.entry.kind, path: d.relPath });
    }
    return files;
}

/** Remembers what the manifest step must store. */
function record(ctx, decisions) {
    for (const d of decisions) {
        if (d.recordHash) ctx.nextFiles[d.relPath] = d.recordHash;
    }
}

module.exports = { decideFile, applyDecisions, record };
