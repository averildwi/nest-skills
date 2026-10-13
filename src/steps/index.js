/**
 * The ordered pipeline. Every step exposes:
 *   - plan(ctx)        -> { entries: PlanEntry[], data? }  (reads only, never writes)
 *   - run(ctx, data)   -> { files? }
 *
 * A step whose entries are all `skip`/`warn` is not executed, which is what
 * makes re-running the CLI safe. `writeIndex` must run before `writeClaudeMd`
 * (it decides ctx.indexFile) and `writeManifest` must be last.
 */
module.exports = [
    require('./installSkills'),
    require('./writeIndex'),
    require('./writeClaudeMd'),
    require('./writeManifest'),
];
