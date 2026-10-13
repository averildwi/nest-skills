#!/usr/bin/env node

const { main } = require('../src/main');
const { CliError, CancelledError } = require('../src/errors');
const ui = require('../src/ui/output');

main(process.argv.slice(2)).catch((err) => {
    if (err instanceof CancelledError) {
        ui.out();
        ui.warn(err.message);
        process.exit(err.exitCode);
    }
    if (err instanceof CliError) {
        ui.error(err.failedStep ? `${err.failedStep} failed: ${err.message}` : err.message);
        for (const h of err.hints) ui.hint(h);
        process.stderr.write('\n');
        process.exit(err.exitCode);
    }
    ui.error('Unexpected error. This is likely a bug in nest-skills.');
    process.stderr.write(`${err && err.stack ? err.stack : err}\n\n`);
    process.exit(1);
});
