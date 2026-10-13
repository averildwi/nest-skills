const { colors: c } = require('./colors');

const out = (line = '') => process.stdout.write(`${line}\n`);

function header(title, subtitle) {
    out();
    out(`  ${c.bold(c.magenta(title))}${subtitle ? `  ${c.gray(subtitle)}` : ''}`);
    out();
}

function section(title) {
    out();
    out(`  ${c.bold(title)}`);
}

function step(index, total, title) {
    out();
    out(`  ${c.cyan(`[${index}/${total}]`)} ${c.bold(title)}`);
}

const success = (msg) => out(`  ${c.green('✔')} ${msg}`);
const warn = (msg) => out(`  ${c.yellow('⚠')} ${c.yellow(msg)}`);
const info = (msg) => out(`  ${c.blue('ℹ')} ${msg}`);
const skip = (msg) => out(`  ${c.gray('○')} ${c.gray(msg)}`);

function error(msg) {
    process.stderr.write(`\n  ${c.red('✖')} ${c.red(c.bold(msg))}\n`);
}

function hint(msg) {
    process.stderr.write(`    ${c.gray(msg)}\n`);
}

/** Aligned two-column key/value list. */
function keyValues(rows) {
    const width = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) out(`    ${c.gray(key.padEnd(width))}  ${value}`);
}

module.exports = { out, header, section, step, success, warn, info, skip, error, hint, keyValues };
