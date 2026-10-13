const fs = require('fs');
const path = require('path');

const { CliError } = require('../errors');
const { MANIFEST_FILE } = require('../config/agents');

/**
 * `.nest-skills.json` records what this tool wrote and the hash of each file
 * at write time. A file whose current hash differs from the recorded one was
 * edited by the user and is never overwritten without --force.
 *
 * Shape: { tool, version, agent, skillsDir, indexFile, files: { "<rel path>": "<sha256>" } }
 */
function manifestPath(projectRoot) {
    return path.join(projectRoot, MANIFEST_FILE);
}

function readManifest(projectRoot) {
    const file = manifestPath(projectRoot);
    if (!fs.existsSync(file)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!data || typeof data !== 'object' || typeof data.files !== 'object') throw new Error('missing "files"');
        return data;
    } catch (err) {
        throw new CliError(`${MANIFEST_FILE} is not valid.`, {
            hints: [err.message, `Fix or delete ${MANIFEST_FILE}. Deleting it makes every installed file count as edited by you.`],
            cause: err,
        });
    }
}

function serializeManifest(manifest) {
    const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
    return `${JSON.stringify({ ...manifest, files }, null, 2)}\n`;
}

module.exports = { manifestPath, readManifest, serializeManifest };
