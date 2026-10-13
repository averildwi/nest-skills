const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

/** Git on Windows may check files out with CRLF; hash the content, not the line endings. */
function normalize(content) {
    return String(content).replace(/\r\n/g, '\n');
}

function hash(content) {
    return crypto.createHash('sha256').update(normalize(content), 'utf8').digest('hex');
}

async function exists(file) {
    try {
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}

async function readText(file) {
    return fs.readFile(file, 'utf8');
}

async function writeText(file, content) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, normalize(content), 'utf8');
}

/** Display a path relative to the project root with forward slashes. */
function rel(root, absolutePath) {
    return path.relative(root, absolutePath).split(path.sep).join('/');
}

module.exports = { normalize, hash, exists, readText, writeText, rel };
