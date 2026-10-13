---
name: nest-auth-and-security
description: Use when adding authentication, authorization, guards, roles, password/OTP hashing, rate limiting, CORS, or route parameter validation in a NestJS project.
---

## When to use

- Protecting an endpoint, adding a role, or reading the current user.
- Login, register, password reset, OTP.
- Touching `main.ts` CORS, `trust proxy`, the throttler, or any `:id` route param.

## Rules

1. Use JWT Bearer only: `ExtractJwt.fromAuthHeaderAsBearerToken()`. The payload is `{ sub, email }` (`JwtPayload`). The default expiry is `JWT_EXPIRES_IN=7d`. Return the token in the login body as `{ accessToken }` through `MessageResponse`. Never put a token in a URL or query string.
2. `JwtStrategy.validate()` re-loads the user from the database with a narrow `select`, throws `UnauthorizedException` when the user is missing or inactive, and returns an `AuthUser`.
3. There is one shared `AuthUser` interface (`src/common/types/auth-user.ts`) for `request.user`. Type `@CurrentUser() user: AuthUser` or `@CurrentUser('id') userId: string`. Never type the user inline (`{ id: number }`).
4. Protect a route with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@ApiBearerAuth('access-token')` on the controller or handler. Add `@Roles(...)` where roles matter. Guards are per controller or route; there is no global auth guard and no `@Public()`.
5. Roles are a union type derived from the Prisma enum. Default naming: field `role`, enum `Role`, union `type RoleName = Role` (→ `'ADMIN' | 'STAFF'`), and `@Roles(...roles: RoleName[])`. Never `string[]`. Use `globalRole` / `GlobalRole` / `GlobalRoleName` **only** when the project has both an app-wide role and a per-team/per-resource role (the per-resource role then lives on the join model, for example `TeamMember.role`). In an existing project, keep the names it already uses.
6. `RolesGuard`: no `@Roles` → allow. No user → 401 `UnauthorizedException`. Wrong role → 403 `ForbiddenException`.
7. The Swagger summary prefix is derived from the guards (`nest-architecture` rule 12): `[PUBLIC]`, `[AUTH]`, or exactly the `@Roles` list joined with `/`. Do not label an endpoint `[ADMIN]` and then allow `STAFF`.
8. Resource ownership checks (only the leader may edit the team) live in the service and throw `ForbiddenException`.
9. Hash passwords **and** OTP codes with `HashingService` (async `scrypt` from `node:crypto`, `salt:hash` format, `timingSafeEqual`). Never use `scryptSync`, bcrypt, or plain text. Always `await` `hash()` and `verify()`.
10. Register `ThrottlerGuard` globally as `APP_GUARD`. Put stricter limits on auth endpoints with `@Throttle({ default: { limit: 5, ttl: 60_000 } })`.
11. OTP: max `MAX_OTP_ATTEMPTS` (5) attempts, expiry (`expiresAt`), single use (`usedAt`), codes from `randomInt` (`node:crypto`). Never use an in-memory `Map` as a rate limiter. Verification order is fixed:
    1. **Claim an attempt atomically first**: `updateMany({ where: { id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_OTP_ATTEMPTS } }, data: { attempts: { increment: 1 } } })`. `count === 0` → reject, without checking the code.
    2. Only then compare the code.
    3. Consume it with `updateMany({ where: { id, usedAt: null }, data: { usedAt } })` inside the success transaction; `count === 0` → reject (a parallel request won).
    Never read `attempts`, compare in JS, then `update`: parallel requests all pass the stale read. Verified on PostgreSQL: 20 parallel wrong guesses → old pattern checked the code 20 times, atomic claim exactly 5.
12. Use the same message for "unknown email" and "wrong password" (`'Invalid credentials'`), and for OTP resend whether or not the email exists. Never reveal whether an account exists.
13. CORS: allow only the origins in `FRONTEND_URL` (comma-separated). If it is empty, allow none (`[]`). Never `'*'`.
14. Every `:id` param has a pipe matching the project ID type: `ParseUUIDPipe` (uuid), `ParseIntPipe` (autoincrement), `ParseCuidPipe` (cuid, custom).
15. Never hardcode a fallback secret or default admin password in app code (`?? 'secret'`). Secrets are required in the Joi schema.
16. Behind a reverse proxy (Nginx, Caddy, a PaaS load balancer, Cloudflare), set `app.set('trust proxy', hops)` in `main.ts` with `hops` = the number of proxies in front of the app, from `TRUST_PROXY_HOPS` (Joi, default `0`). The throttler keys on `req.ip`:
    - Without it, `req.ip` is the proxy, so **all clients share one throttle bucket** (one user can lock out everyone, and the limit stops protecting anything).
    - With `true`, Express takes the left-most `X-Forwarded-For` value, which the client controls, so an attacker gets a fresh bucket per request.
    - Ask the user how many proxies are in front of production if it is not documented. Verified at runtime with `X-Forwarded-For` (see Good example).

## Good example

```ts
// src/common/types/auth-user.ts
import type { Request } from 'express';
import type { Role } from '../../../generated/prisma/client';

export interface AuthUser { id: string; email: string; role: Role }
export interface JwtPayload { sub: string; email: string }
export interface AuthenticatedRequest extends Request { user?: AuthUser }

// src/common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export type RoleName = Role; // 'ADMIN' | 'STAFF'
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

// src/common/guards/roles.guard.ts
canActivate(context: ExecutionContext): boolean {
  const requiredRoles = this.reflector.getAllAndOverride<RoleName[] | undefined>(
    ROLES_KEY, [context.getHandler(), context.getClass()]);
  if (!requiredRoles || requiredRoles.length === 0) return true;
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!user) throw new UnauthorizedException('Authentication required');
  if (!requiredRoles.includes(user.role)) {
    throw new ForbiddenException('You are not allowed to perform this action');
  }
  return true;
}
```

```ts
// src/common/hashing/hashing.service.ts
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

@Injectable()
export class HashingService {
  async hash(plainText: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(plainText, salt, KEY_LENGTH);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  async verify(plainText: string, storedHash: string): Promise<boolean> {
    const [salt, storedKey] = storedHash.split(':');
    if (!salt || !storedKey) return false;
    const storedBuffer = Buffer.from(storedKey, 'hex');
    if (storedBuffer.length !== KEY_LENGTH) return false;
    return timingSafeEqual(await scryptAsync(plainText, salt, KEY_LENGTH), storedBuffer);
  }
}
```

```ts
// src/auth/strategies/jwt.strategy.ts
constructor(config: ConfigService, private readonly prisma: PrismaService) {
  super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false,
    secretOrKey: config.getOrThrow<string>('JWT_SECRET') });
}

async validate(payload: JwtPayload): Promise<AuthUser> {
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub }, select: { id: true, email: true, role: true, isActive: true } });
  if (!user || !user.isActive) throw new UnauthorizedException('Account not found or inactive');
  return { id: user.id, email: user.email, role: user.role };
}
```

```ts
// Controller usage + throttling + id pipe
@ApiTags('Teams')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: '[ADMIN] Update a team' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamDto) { /* ... */ }
}

@Post('login')
@HttpCode(HttpStatus.OK)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
async login(@Body() dto: LoginDto) {
  return new MessageResponse(await this.authService.login(dto), 'Login successful');
}

// app.module.ts
imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), /* ... */],
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],

// src/common/pipes/parse-cuid.pipe.ts: only for cuid projects
const CUID_REGEX = /^c[a-z0-9]{20,32}$/; // same check Prisma uses for cuid()
transform(value: string): string {
  if (!CUID_REGEX.test(value)) throw new BadRequestException('Validation failed (cuid is expected)');
  return value;
}
```

```ts
// OTP verify: claim an attempt atomically, then check the code, then consume once.
const now = new Date();
const otp = await this.prisma.otpCode.findFirst({
  where: { userId, usedAt: null, expiresAt: { gt: now } },
  select: { id: true, codeHash: true }, orderBy: { createdAt: 'desc' } });
if (!otp) throw new BadRequestException('Code is invalid or expired');

const claim = await this.prisma.otpCode.updateMany({
  where: { id: otp.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_OTP_ATTEMPTS } },
  data: { attempts: { increment: 1 } } });
if (claim.count === 0) throw new BadRequestException('Code is invalid or expired, request a new code');

if (!(await this.hashing.verify(code, otp.codeHash))) throw new BadRequestException('Code is invalid or expired');

await this.prisma.$transaction(async (tx) => {
  const consumed = await tx.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count === 0) throw new BadRequestException('Code is invalid or expired');
  await tx.user.update({ where: { id: userId }, data: { isActive: true } });
});
```

Parallel test (unit; the mock imitates the guarded UPDATE):

```ts
it('lets at most MAX_OTP_ATTEMPTS parallel guesses reach the code check', async () => {
  let attempts = 0;
  prisma.otpCode.updateMany.mockImplementation(() => {
    if (attempts >= MAX_OTP_ATTEMPTS) return Promise.resolve({ count: 0 });
    attempts += 1;
    return Promise.resolve({ count: 1 });
  });
  hashing.verify.mockResolvedValue(false);
  await Promise.allSettled(Array.from({ length: 20 }, () => service.verify('user-1', '000000')));
  expect(hashing.verify).toHaveBeenCalledTimes(MAX_OTP_ATTEMPTS);
});
```

```ts
// main.ts: trust proxy (rule 16) + CORS
app.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS')); // 1 behind one Nginx
const allowedOrigins = (process.env.FRONTEND_URL ?? '').split(',').map((o) => o.trim()).filter(Boolean);
app.enableCors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
```

Verified behind one proxy (limit 2, every request from the proxy socket, `X-Forwarded-For` set):

| `trust proxy` | client A (3 req) | client B (2 req) | attacker, fake XFF (4 req) |
|---|---|---|---|
| not set | 200, 200, 429 (`req.ip` = proxy) | 429, 429 | 429 ×4: everyone shares one bucket |
| `1` | 200, 200, 429 | 200, 200 | 200, 200, 429, 429: real IP used |
| `true` | 200, 200, 429 | 200, 200 | 200 ×4: spoofed IP, limit bypassed |

## Bad example

```ts
@Roles('PANITIA', 'SISWA')                 // BAD: label says [PANITIA] but SISWA is allowed too
@ApiOperation({ summary: '[PANITIA] Approve team' })
approve(@Param('id') id: string,           // BAD: no ParseUUIDPipe, so a bad id becomes 500
        @CurrentUser() user: { id: number }) {}  // BAD: inline user type

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles); // BAD: typos compile
const hash = scryptSync(password, salt, 64);          // BAD: blocks the event loop
secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',  // BAD: fallback secret + process.env
app.enableCors({ origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*' }); // BAD
const attempts = new Map<string, number>();           // BAD: in-memory limiter, lost on restart, grows forever
if (otp.attempts >= MAX_OTP_ATTEMPTS) throw ...;      // BAD: stale read, 20 parallel guesses all pass it
await this.prisma.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } }); // ...and only then count
app.set('trust proxy', true);                         // BAD: client-controlled X-Forwarded-For becomes req.ip
if (!user) throw new NotFoundException('Email not found'); // BAD: account enumeration
res.redirect(`${frontendUrl}/callback?token=${token}`);    // BAD: token in URL
```

## Checklist before finishing

- [ ] Protected routes have `JwtAuthGuard` (+ `RolesGuard`/`@Roles` when needed) and `@ApiBearerAuth('access-token')`.
- [ ] `@Roles` uses `RoleName` values (or the project's existing role union), and the Swagger prefix is `[PUBLIC]`, `[AUTH]`, or exactly the `@Roles` list joined by `/`.
- [ ] Every `:id` has the correct parse pipe.
- [ ] The user is typed as `AuthUser`.
- [ ] Passwords/OTPs use async `HashingService`, and every call is awaited.
- [ ] Auth/OTP endpoints have `@Throttle`. OTP claims an attempt with a guarded `updateMany` before checking the code, expires, and is consumed once with `updateMany` + `count` check.
- [ ] `trust proxy` is set to the real hop count from `TRUST_PROXY_HOPS`, never `true`.
- [ ] No `'*'` CORS, no fallback secrets, no token in a URL, no account enumeration.
