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

## Local dev

```bash
pnpm --filter demo dev
```
