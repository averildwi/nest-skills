# Changelog

All notable changes to `@averildwi/nest-skills` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-11-25

### Added

- The skills are installed for the project stack, detected from `package.json`
  (`src/utils/detectStack.js`, shared verbatim with nest-prisma and
  nest-cloudinary) and shown in the plan as `Project stack`:
  - Vitest: `vi.fn()`, `vi.spyOn()`, `import type { Mock } from 'vitest'`, the
    Vitest config and e2e command. Jest keeps `jest.fn()` / `jest.Mock`.
  - oxlint: the lint gate is `npm run lint`, rules are `typescript/...` in
    `.oxlintrc.json`. ESLint keeps `npx eslint "{src,apps,libs,test}/**/*.ts"`.
  - ESM / `.js` imports: relative imports in the examples end in `.js`.
  Nothing is inferred from the Nest major.
- The stack is recorded in `.nest-skills.json`. When the project changes stack,
  the next run reports it and re-renders the skills you have not edited.
- `AGENTS.md` names the detected stack.

### Changed

- A project's own `AGENTS.md` (Nest 12 `nest new` always writes one) now gets
  the index as a block between `<!-- nest-skills:start -->` and
  `<!-- nest-skills:end -->`, instead of a separate `AGENTS.nest-skills.md` that
  had to be linked by hand. Text outside the markers is never touched and keeps
  its line endings; a deleted block is not added back without `--force`.
  Installs made before keep their `AGENTS.nest-skills.md`.
- `@nestjs/jwt` is no longer pinned to `^11`. The auth reference explains when
  v12 loads under Jest instead (Node >= 24.9 with `--experimental-vm-modules`).
- `@nestjs/config` 12: Joi options go in `validationOptions.libraryOptions`;
  the flat shape fails to compile.
- README: create the project with `@nestjs/cli@latest`; the skills cover Nest
  11 and 12, CommonJS and ESM.
- `engines.node` is now `^20.19 || ^22.12 || >=24.0`, like the other scaffolds.

### Fixed

- `import * as Joi from 'joi'` in the examples failed at boot in ESM projects
  (`Joi.string is not a function`). The skills now use `import Joi from 'joi'`.
- `nest-testing` did not say that a Nest 12 CommonJS `jest.config.ts` needs the
  `.js` `moduleNameMapper` too; without it every spec that imports
  `PrismaService` fails with "Cannot find module './internal/class.js'".

## [1.1.0] - 2026-11-13

### Added

- `nest-cloudinary` skill for the `@averildwi/nest-cloudinary` upload module.

## [1.0.3] - 2026-11-13

### Changed

- README: add `@averildwi/nest-cloudinary` to the recommended setup order.

### Fixed

- Cross-skill reference links are written in full.

## [1.0.2] - 2026-10-16

### Added

- Every file of a skill folder is installed, not only `SKILL.md`.

### Changed

- The auth skill is rebuilt around the audit findings, with reference files
  under `nest-auth-and-security/references/`. Architecture, testing and
  `AGENTS.md` point at the new auth standard.

## [1.0.1] - 2026-10-15

### Changed

- `AGENTS.md` tells the agent that the `src/common` and `src/prisma` scaffolds
  are the standard.

## [1.0.0] - 2026-10-14

### Added

- CLI that installs the NestJS + Prisma standards as agent skills for OpenCode,
  Claude Code or both, plus an `AGENTS.md` index and `.nest-skills.json`.

[Unreleased]: https://github.com/averildwi/nest-skills/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/averildwi/nest-skills/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/averildwi/nest-skills/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/averildwi/nest-skills/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/averildwi/nest-skills/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/averildwi/nest-skills/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/averildwi/nest-skills/releases/tag/v1.0.0
