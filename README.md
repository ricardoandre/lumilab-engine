# @lumilab/engine

The shared machinery behind every Lumilab app: list/detail/form UI, ACL, the CRUD
API layer, and (soon) the release tooling. Extracted from kanoapp, which is the
first consumer.

## What is in here

| Directory    | Contents |
|--------------|----------|
| `src/ui/`    | ListEngine, ResourceForm/Drawer/Show, the field widgets, AppSider/AppHeader |
| `src/lib/`   | resource-config, filters, form-dates, permissions hooks, the option cache |
| `src/server/`| ACL, crud-api, app settings, capabilities, impersonation |
| `src/runtime.ts` | **the seam** — see below |

## The seam

The engine must never import an app's Prisma client, its `auth()`, or its nav.
Each app calls `configureEngine()` once at startup and the engine reads them back
through `runtime.ts`.

```ts
import { configureEngine } from '@lumilab/engine/runtime';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { NAV_GROUPS } from '@/lib/nav-structure';

configureEngine({ db: prisma, auth, navGroups: NAV_GROUPS });
```

**Why this matters concretely.** Prisma never writes `SELECT *` — a generated
client names every column of the schema it was built from. An engine that
imported one app's client would drag that app's whole schema into the other app,
and the second database would be missing every one of those columns. This
indirection is what keeps two apps on two databases genuinely independent.

Entities are registered the same way, so entity links resolve per app:

```ts
import { registerEntities } from '@lumilab/engine/lib/entity-registry';
registerEntities({ accounts: () => import('@/lib/resources/account').then((m) => m.accountResource) });
```

## Consumed as TypeScript source

There is no build step. Apps list the package in `transpilePackages`, so types
stay exact and "always latest" is genuinely instant — no publish, no version skew
between what you typechecked and what ships.

## Always-latest policy

Every deploy builds against the newest engine `main`. That is a deliberate choice
(Andre, 2026-09-06) and it rests on one rule:

> **Whatever is on the engine's `main` must always be deployable.**

Unfinished engine work lives on a branch. This is the same rule kanoapp already
runs on — committing is approval to release.

The safety net is the existing release pipeline: a deploy builds in an isolated
worktree, sweeps every route, and drives every screen in a real browser *before*
flipping production, then rolls back on failure. So a bad engine version blocks a
release rather than breaking a live site. There is a pin escape hatch for the day
you must ship around a broken engine.

## Requirements an app must meet

The engine expects these tables to exist (names as Prisma models):

- `User` — with `isAdmin`
- `Role`, and the permission rows the ACL reads
- `FieldOption` — only if you use ACL option-scopes
- `AppSetting` — only if you use app settings or capabilities

Anything else is the app's own.
