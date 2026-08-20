# Repository harness profile

| Item                    | Current value                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Package manager         | Bun `1.3.14`                                                                       |
| Runtime                 | Bun `>=1.3.14`                                                                     |
| Monorepo                | Bun workspaces plus Turbo `2.10.6`                                                 |
| TypeScript              | `7.0.2`, strict, exact optional properties, no unchecked indexed access            |
| Effect                  | `4.0.0-beta.107`                                                                   |
| Effect Platform Bun     | `4.0.0-beta.107`                                                                   |
| Effect Vitest           | `4.0.0-beta.107`                                                                   |
| Vitest                  | `4.1.10`                                                                           |
| Formatter               | Oxfmt `0.60.0`                                                                     |
| Linter                  | Oxlint `1.75.0`                                                                    |
| Export/dead-code checks | Knip `6.29.0` plus package validator                                               |
| License                 | Apache-2.0; selected for a permissive public library without Microsoft affiliation |

The lockfile and this snapshot are checked together. The standalone-process
slice aligns unteam with Pollsor's exact installed Effect beta.107 family. The
installed beta.107 sources and types are authoritative for CLI, runtime,
Schema, Bun server, and child-process behavior; newer release-candidate or
current-main guidance does not override them.

The validation sequence is intentionally serial because build outputs and packed artifacts are shared evidence:

```sh
bun install --frozen-lockfile
bun run verification
```

`verification` covers formatting, lint, typechecking, Knip, package tests, build, export/package checks, documentation/governance checks, and packed-artifact proof.
