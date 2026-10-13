const fs = require('fs');
const path = require('path');

const { CliError } = require('./errors');

function readPackageJson(projectRoot) {
    const file = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(file)) {
        throw new CliError('No package.json found in the current directory.', {
            hints: [`Current directory: ${projectRoot}`, 'Run this command from the root of your NestJS project.'],
        });
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        throw new CliError('package.json is not valid JSON.', { hints: [err.message], cause: err });
    }
}

/** Validates that the current directory is a NestJS project. Reads only package.json. */
function runPreflight(projectRoot) {
    const pkgJson = readPackageJson(projectRoot);
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    if (!deps['@nestjs/core']) {
        throw new CliError("This doesn't look like a NestJS project.", {
            hints: [
                'package.json does not list @nestjs/core.',
                'Create one first with: npx @nestjs/cli new my-app',
            ],
        });
    }
    return { pkgJson };
}

module.exports = { runPreflight, readPackageJson };
