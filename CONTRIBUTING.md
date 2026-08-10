# Contributing

Read `AGENTS.md`, `ARCHITECTURE.md`, and `docs/README.md` before changing code. Keep semantic ownership narrow, add or update a schema/error/proof receipt with contract changes, and run:

```sh
bun install --frozen-lockfile
bun run verification
```

Do not add provider credentials, live Microsoft calls, generated caches, raw bearer tokens, or Pollsor-only state. New packages require a second real owner and an architecture decision.
