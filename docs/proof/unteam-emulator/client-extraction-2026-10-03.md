# Local client extraction proof — 2026-10-03

This receipt covers UNTEAM-010 in the separate unteam worktree at
`codex/unteam-client`, based on source revision
`f63eca6da106792d69c59377c3c8d91ea3ff851c`. The verified source slice
was committed locally as `cf795d68dbe0c2091ad62c52cf50cad376e06675`.
The artifact checks below ran against that source tree before the commit; no
published release is claimed.

`@unteam/client@0.1.0` shares scenario/readiness wire Schemas with
`@unteam/emulator-core@0.2.0`. Its runtime imports neither the Bun host nor
Pollsor. The Bun host still owns the server. The client tests ran an actual
scoped loopback server, checked readiness and named controls, and checked
wrong-version decoding. The clean packed consumer installed all three
artifacts and checked exports, types, and runtime imports.

The following passed locally with Bun 1.4.0 and Effect 4.0.0-beta.107:

- `bun install`
- `bun run verification` (format, lint, types, Knip, tests, builds,
  exports, repository/governance validation, packed consumer)
- `bun run test:packed`

The resulting ignored local artifacts had these SHA-256 values at the time of
this receipt:

| Artifact                         | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `unteam-emulator-core-0.2.0.tgz` | `79084c1409cada39d607c91588d3a265970f30ce609fe8f7ff6a1a0b258fe17d` |
| `unteam-emulator-bun-0.2.0.tgz`  | `fee17dc16e5e7ae2935341df77fe11df67a196942e832caea8127377aa61c542` |
| `unteam-client-0.1.0.tgz`        | `79249c4b96b99c3844b39e008474306b38d04d9ed9aed4a24ccf06c908e453e7` |

The CLI test first failed because its test imported the core package without
a direct development dependency; this was corrected. The generated Bun
executable was also stopped by macOS until ad-hoc signed; the existing build
command now signs it on macOS. These are local build/test fixes, not provider
proof. The isolated TypeScript consumer uses the repository's recorded
`skipLibCheck` policy for the installed Effect beta declarations.

No publication, push, deployment, Microsoft access, tenant qualification or
Pollsor full-system journey is claimed here. Pollsor consumption is a separate
TER-002 proof step.
