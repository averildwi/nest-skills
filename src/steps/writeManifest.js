const path = require('path');

const fsx = require('../utils/fsHelpers');
const { MANIFEST_FILE } = require('../config/agents');
const { manifestPath, serializeManifest } = require('../utils/manifest');

/**
 * Must run last: earlier steps fill ctx.nextFiles during plan().
 * Files that were tracked before but are no longer produced (for example after
 * switching agent) stay tracked so a later run can still tell user edits apart.
 */
function buildManifest(ctx) {
    const previous = ctx.manifest ? ctx.manifest.files : {};
    return {
        tool: ctx.pkg.name,
        version: ctx.pkg.version,
        agent: ctx.agent.value,
        skillsDir: ctx.skillsDir,
        indexFile: ctx.indexFile,
        files: { ...previous, ...ctx.nextFiles },
    };
}

module.exports = {
    id: 'manifest',
    title: `Record installed files in ${MANIFEST_FILE}`,
    buildManifest,

    async plan(ctx) {
        const file = manifestPath(ctx.projectRoot);
        const content = serializeManifest(buildManifest(ctx));
        if (await fsx.exists(file)) {
            if (fsx.normalize(await fsx.readText(file)) === content) {
                return { entries: [{ kind: 'skip', label: MANIFEST_FILE, reason: 'up to date' }] };
            }
            return { entries: [{ kind: 'modify', label: MANIFEST_FILE }], data: { content, file } };
        }
        return { entries: [{ kind: 'create', label: MANIFEST_FILE }], data: { content, file } };
    },

    async run(ctx, { content, file }) {
        const existed = await fsx.exists(file);
        await fsx.writeText(file, content);
        ctx.ui.success(`${existed ? 'Updated' : 'Created'} ${MANIFEST_FILE}`);
        return { files: [{ kind: existed ? 'modify' : 'create', path: path.basename(file) }] };
    },
};
