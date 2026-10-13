# AGENTS.md: NestJS standards (Everill)

This project follows a fixed NestJS + Prisma standard. The rules live in skills under
`{{SKILLS_DIR}}/<name>/SKILL.md`. **Load the matching skill before writing code in its area**
(use your skill tool if you have one, otherwise read the file).
If a rule here conflicts with your general habits, the skill wins.

## Which skill to read

| You are about to... | Read |
|---|---|
| Create a feature, add files, name things, edit `main.ts`/`app.module.ts`, add Swagger docs | `nest-architecture` |
| Return data from a controller, throw an error, touch interceptors/filters | `nest-response-and-errors` |
| Write a DTO, add a query/body param, add or read an env var | `nest-validation-and-config` |
| Change `schema.prisma`, `PrismaService`, write any Prisma query, or run a Prisma CLI command | `nest-prisma` |
| Add auth, guards, roles, hashing, OTP, throttling, CORS, `trust proxy`, `:id` params | `nest-auth-and-security` |
| Add or change business logic (tests are required) | `nest-testing` |
| Change any file in a git repository | `git-workflow` (always) |

## Work order for a new feature

1. `git-workflow`: get onto a `feat/<topic>` branch.
2. `nest-prisma`: schema change if needed. **Ask the ID type first on a new project.**
3. `nest-validation-and-config`: DTOs.
4. `nest-architecture` + `nest-prisma`: service, then controller, then register the module.
5. `nest-auth-and-security`: guards, roles, `:id` pipes.
6. `nest-response-and-errors`: return markers and exceptions.
7. `nest-testing`: service spec.
8. `git-workflow`: lint the changed files, test, build when rule 5 requires it, stage specific files, commit, report the hash.

## Global rules (always apply)

1. Everything is in **English**: error and success messages, comments, test names, commits.
2. Ask before deciding anything a skill marks as **Ask first**. Never guess the ID type or soft-delete needs.
3. Never do these:
   - `include: { relation: true }`. Always use an explicit `select`.
   - `process.env` outside `main.ts` and `PrismaService`. Use `ConfigService`.
   - An inline user type (`@CurrentUser() user: { id: number }`). Use `AuthUser`.
   - `@Roles(...roles: string[])`. Use the role union derived from the Prisma enum (`RoleName`).
   - `scryptSync`, bcrypt, or plain-text secrets. Use async `HashingService`.
   - `any`. Use real types, `unknown`, or generics.
   - `@Param('id')` without `ParseUUIDPipe` / `ParseIntPipe` / `ParseCuidPipe`.
   - `@Body()` / `@Query()` without a DTO class.
   - CORS `'*'`, or `trust proxy` set to `true`.
   - A hardcoded fallback secret or default password in app code.
   - A boilerplate `it('should be defined')` spec.
   - `await` on Prisma inside a loop.
   - Services returning `{ message, data }`.
   - `prisma migrate reset`, `db push --accept-data-loss` / `--force-reset` without explicit approval, or a workaround when Prisma refuses.
4. New projects use strict TypeScript: `"strict": true` (at minimum `"noImplicitAny": true`) and ESLint `@typescript-eslint/no-explicit-any: "warn"`. Do not retrofit strictness into an existing project unless asked.
5. Before saying you are done: you ran lint on the files you changed and the tests yourself, and they pass. Run `npm run build` too when `git-workflow` rule 5 requires it (Prisma schema, `tsconfig*.json`, `nest-cli.json`, `package.json`, `main.ts`). Then commit per `git-workflow`.
6. Never read, print or commit `.env*` contents or secrets.

## When the existing code differs from these skills

The skills describe the **target** standard. Generated scaffold code (`src/common/`, `src/prisma/`)
or older code in this repository may still differ, for example `page?: number` in `PaginationDto`,
`string[]` roles, `any` in interceptors, `FRONTEND_URL` defaulting to `'*'`, or a missing `AuthUser`.

- **Code you write** follows the skills.
- **When your code calls existing code**, adapt at the call site instead of breaking the build
  (for example `query.page ?? 1`), and keep the change small.
- **Do not rewrite existing shared code** as a side effect of a feature. If it blocks you (a type
  error, a security problem such as CORS `'*'`), tell the user what differs and propose a separate
  `refactor(common)` / `fix(common)` commit. Do it only after the user agrees.
- Pre-existing lint errors in files you did not touch never block your commit (`git-workflow` rule 6).
