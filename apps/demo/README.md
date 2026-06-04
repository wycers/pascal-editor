# Pascal Demo

Standalone Next.js app for the modular building demo.

## Layout

- `app/page.tsx` - demo landing page and scene generator
- `app/scene/[id]/page.tsx` - scene viewer/editor entry
- `app/scenes/page.tsx` - scene list
- `app/api/demo/generate/route.ts` - deterministic demo scene generation
- `app/api/bom/export/route.ts` - BOM export for the demo scene graph

## Vercel

Deploy this app by setting the project root to `apps/demo`.

Required runtime environment:

- `DATABASE_URL` or `POSTGRES_URL` - Neon/Postgres connection string.

Optional runtime environment:

- `PASCAL_SCENE_API_TOKEN` - shared token for external non-browser scene API requests.
- `PASCAL_DEMO_PG_POOL_MAX` - pg pool size, defaults to `5`.
- `PASCAL_MAX_SCENE_BYTES` - max scene graph payload size, defaults to `10485760`.
- `NEXT_PUBLIC_APP_URL` - canonical public URL for server-side route fetches.

## Local dev

```bash
pnpm --filter demo dev
```
