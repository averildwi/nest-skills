# @averildwi/nest-skills

Install Everill's NestJS + Prisma coding standards into a project as **agent skills**
plus an **`AGENTS.md`** index, so AI coding agents (OpenCode, Claude Code) write code
that follows the same rules as the rest of the team.

It only writes Markdown. It never touches your code, `package.json` or `.env*`.

```bash
npx @averildwi/nest-skills --agent opencode
```

## Recommended order on a new project

```bash
npx @nestjs/cli@11 new my-app --strict
cd my-app
npx @averildwi/nest-prisma --db postgres     # client in generated/prisma (root)
npx @averildwi/nest-common
npx @averildwi/nest-skills --agent opencode   # or claude / both
```

Commit after each tool, on its own (see the `git-workflow` skill). The standard
targets Nest 11 (CommonJS + Jest + ESLint); pin `@nestjs/cli@11` when creating
the project.

## What gets installed

| Agent | Skills folder | Index | Extra |
|---|---|---|---|
| `opencode` | `.opencode/skills/<name>/SKILL.md` | `AGENTS.md` | |
| `claude` | `.claude/skills/<name>/SKILL.md` | `AGENTS.md` | `CLAUDE.md` with `@AGENTS.md` |
| `both` | `.claude/skills/<name>/SKILL.md` (OpenCode reads this folder too) | `AGENTS.md` | `CLAUDE.md` with `@AGENTS.md` |

Plus `.nest-skills.json`, which records a hash of every file the tool wrote. Commit it.

Skills:

| Skill | Covers |
|---|---|
| `nest-architecture` | folder layout, layering, naming, `main.ts` order, `trust proxy`, Swagger prefixes |
| `nest-response-and-errors` | response envelope, marker classes, exception filters and their order |
| `nest-validation-and-config` | DTOs, `PaginationDto`, `ValidationPipe`, Joi env schema, `ConfigService` |
| `nest-prisma` | ID type (asked first), `@@map`, timestamps, `select`, transactions, destructive commands |
| `nest-auth-and-security` | JWT, guards, roles, scrypt hashing, OTP, throttling, CORS, `:id` pipes |
| `nest-testing` | service unit tests with mocked Prisma and transactions |
| `git-workflow` | branch, verify, stage specific files, Conventional Commits, local commits only |

`AGENTS.md` maps tasks to skills, lists the global "never do" rules, and says how to
behave when existing scaffold code differs from the standard.

## Options

```
npx @averildwi/nest-skills [install] [options]
npx @averildwi/nest-skills update [options]

-a, --agent <name>   opencode | claude | both
--dir <path>         install skills in another folder (relative, inside the project)
--force              overwrite files you edited (old copy kept in .nest-skills-backup/)
-y, --yes            no prompts, no confirmation
--dry-run            show the plan only
--no-color           plain output
-v, --version        print the version
-h, --help           show help
```

## Your files are safe

- Your own **`AGENTS.md` / `CLAUDE.md`** (not written by nest-skills) are **never** overwritten,
  not even with `--force`.
  - Own `AGENTS.md`: the index goes to `AGENTS.nest-skills.md` and the CLI prints the line to add.
  - Own `CLAUDE.md`: left as is; the CLI tells you to add `@AGENTS.md` (or the fallback name).
- A skill file with the same name that you wrote yourself is kept; `--force` replaces it
  and saves yours under `.nest-skills-backup/<timestamp>/`.
- A file nest-skills wrote and **you edited** is kept by `install` and `update`.
  `--force` replaces it and saves your version under `.nest-skills-backup/<timestamp>/`.
  That folder sits outside the skills folder (the agent never loads a backup) and
  contains its own `.gitignore`, so it is never committed by accident.
- Running the command twice changes nothing.
- CRLF vs LF does not count as an edit.

## How it works

The CLI follows the same pattern as `@averildwi/nest-common` and `@averildwi/nest-prisma`:
a list of steps (`src/steps/*`), each with `plan(ctx)` (reads only) and `run(ctx, data)`.
The full plan is printed first, then applied after confirmation (or `--yes`).

See [docs/USAGE.md](docs/USAGE.md) for details and edge cases.

## Development

```bash
npm install
npm test        # node:test, unit + integration (spawns the real CLI in temp folders)
```

## License

MIT
