# Release checklist

Run these steps from the package directory before publishing.

1. **Install exactly what CI installs**

   ```bash
   npm ci
   ```

2. **Run the test suite**

   ```bash
   npm test
   ```

   Expected: all files in `test/` pass on Node 20, 22, 24 and 26.

3. **Inspect the published package**

   ```bash
   npm pack --dry-run
   ```

   The tarball must contain `bin/`, `src/` (including `src/utils/detectStack.js`),
   `templates/`, `docs/`, `CHANGELOG.md`, `LICENSE`, and `README.md`. It must not
   contain `test/` or `node_modules/`.

4. **Check `detectStack.js` is still the shared copy**

   ```bash
   git hash-object src/utils/detectStack.js test/detectStack.test.js
   git -C ../nest-prisma rev-parse HEAD:src/utils/detectStack.js HEAD:test/detectStack.test.js
   ```

   The hashes must match. If they differ, copy the newer file into every scaffold first.

5. **Smoke test on real projects**

   Run the packed CLI on a fresh Nest 12 ESM app, a Nest 12 CommonJS app and a Nest 11
   app (`npx @nestjs/cli@latest new x --type esm|cjs --no-observe --no-interactive`):

   - the plan shows the expected `Project stack`,
   - the app's own `AGENTS.md` keeps its text, with the nest-skills block appended,
   - a second run prints "Nothing to do".

6. **Update the changelog**

   Move the `## [Unreleased]` entries in `CHANGELOG.md` under the new version and date,
   and add the compare link at the bottom.

7. **Bump the version**

   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   ```

   Keep `package.json` and `package-lock.json` in sync.

8. **Publish**

   ```bash
   npm publish --access public
   git push && git push --tags
   ```

9. **Verify the published binary**

   ```bash
   npx @averildwi/nest-skills@X.Y.Z --help
   npx @averildwi/nest-skills@X.Y.Z --version
   ```
