# Pulse docs (Fumadocs)

Static Next.js site for the Pulse feature guide.

```bash
# from the repo root
bun run docs:dev
```

http://localhost:3000 — landing page, `/docs` for the guide.

MDX under `content/docs` is generated from `src/lib/feature-docs.ts`. Do not edit those pages by hand; change the TypeScript source and run `bun run docs:sync`.
