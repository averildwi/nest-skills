const START = '<!-- nest-skills:start -->';
const END = '<!-- nest-skills:end -->';

/**
 * The index can live inside the project's own AGENTS.md, between two markers.
 * `nest new` (Nest 12) writes an AGENTS.md of its own, so a separate
 * AGENTS.nest-skills.md would never be read unless the user links it by hand.
 *
 * Only the text between the markers belongs to nest-skills; everything around
 * it is the user's and is never read, moved or rewritten.
 */
const BLOCK_HEADER = [
    START,
    '<!-- Managed by @averildwi/nest-skills. Your text outside these two markers is never touched.',
    '     Re-run `npx @averildwi/nest-skills update` to refresh it; edits inside are kept unless you pass --force. -->',
];

/** The markers of an existing block, or null when the source has none. */
function findBlock(source) {
    const start = source.indexOf(START);
    if (start < 0) return null;
    const end = source.indexOf(END, start + START.length);
    if (end < 0) return null;
    return { start, end: end + END.length };
}

/** The managed note that follows the start marker; not part of the block's content. */
const HEADER_NOTE = /^\s*<!--[^]*?Managed by @averildwi\/nest-skills[^]*?-->/;

/** The block's content (what nest-skills wrote), without the markers and the header note. */
function readBlock(source) {
    const at = findBlock(source);
    if (!at) return null;
    const inner = source.slice(at.start + START.length, at.end - END.length);
    const body = inner.replace(HEADER_NOTE, '');
    return body.replace(/^(\r?\n)+/, '').replace(/(\r?\n)[ \t]*$/, '');
}

function renderBlock(body, eol = '\n') {
    const lines = [...BLOCK_HEADER, '', ...body.split(/\r?\n/), END];
    return lines.join(eol);
}

/** CRLF when the file uses it more often than LF, so an edit keeps the file's style. */
function eolOf(source) {
    const crlf = (source.match(/\r\n/g) || []).length;
    const lf = (source.match(/(?<!\r)\n/g) || []).length;
    return crlf > lf ? '\r\n' : '\n';
}

/**
 * Returns the user's file with the nest-skills block replaced, or appended
 * when there is none yet. Text outside the markers is byte-for-byte unchanged.
 */
function writeBlock(source, body) {
    const eol = eolOf(source);
    const block = renderBlock(body, eol);
    const at = findBlock(source);
    if (at) return source.slice(0, at.start) + block + source.slice(at.end);
    const separator = source.length === 0 ? '' : /\r?\n[ \t]*\r?\n$/.test(source) ? '' : /\r?\n$/.test(source) ? eol : eol + eol;
    return `${source}${separator}${block}${eol}`;
}

module.exports = { START, END, findBlock, readBlock, renderBlock, writeBlock, eolOf };
