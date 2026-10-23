# Repository harness profile

| Item                    | Current value                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Package manager         | Bun `1.4.3`                                                                        |
| Runtime                 | Bun `>=1.4.3`                                                                      |
| Monorepo                | Bun workspaces plus Turbo `2.11.10`                                                |
| TypeScript              | `7.0.2`, strict, exact optional properties, no unchecked indexed access            |
| Effect                  | `4.0.5`                                                                            |
| Effect Platform Bun     | `4.0.5`                                                                            |
| Effect Vitest           | `4.0.5`                                                                            |
| Vitest                  | `5.0.5`                                                                            |
| Formatter               | Oxfmt `0.74.0`                                                                     |
| Linter                  | Oxlint `1.89.0`                                                                    |
| Export/dead-code checks | Knip `6.42.1` plus package validator                                               |
| License                 | Apache-2.0; selected for a permissive public library without Microsoft affiliation |

The lockfile and this snapshot were refreshed on 2026-10-22. Both unteam
and Pollsor use Effect 4.0.5. Installed release sources and types own API
compatibility; the older npm beta tag does not select the installed version.

The validation sequence is intentionally serial because build outputs and packed artifacts are shared evidence. Build runs before type-aware lint so a clean checkout has the public declarations needed by workspace consumers:

```sh
bun install --frozen-lockfile
bun run verification
```

`verification` covers formatting, lint, typechecking, Knip, package tests, build, export/package checks, documentation/governance checks, and packed-artifact proof.

The packed consumer retains the repository's `skipLibCheck` policy. It checks
unteam's public declarations against consumer code and exercises both default
and source-condition runtime imports. It does not check every dependency's
internal declarations.

## Effect checker setup

The root `prepare` runs `effect-tsgo patch --oxlint` after installation. Checker
0.56.0 supports the selected TypeScript 7.0.2, Oxlint 1.89.0 and
oxlint-tsgolint 7.0.2004 together. Normal lint refreshes the public lint package,
patches again, then runs native Effect correctness as errors with type-aware
checking and warning failures. Existing rules remain active; portable checks
also cover the new event, recorder and CLI runtime owners. Exact unstable APIs
from pinned Effect 4.0.5 are approved only in their current files in
`tsconfig.json`. The native router's unknown error channel is converted at the
HTTP host; its narrow documented diagnostic exception stays at that call.

The root configuration extends Commonplace's complete `strict` preset
(`@commonplaces/oxlint-plugin` 0.6.1 at the 2026-10-23 review), alongside native
Effect correctness checks. It covers application code, packages, scripts and
tests. Generated build output and packed artifacts are ignored; tests and tools
have no blanket exemption. The optional `style` preset is separate.

Only the exact Web Crypto signing adapter allows Promise conversion, because
Web Crypto exposes Promise-only methods. It still rejects async functions and
Promise chains. Static Layers receive checked configuration through named
services; filesystem, process, HTTP and state operations use native Effect APIs.
Exact inline exceptions document host-required tags, checked terminal encoding
and data fields that resemble operation names. These do not disable a whole file.

Packed package manifests are decoded through Schema before their exports are
checked. JWT JSON output uses Schema encoding. The generic `decodeExact`
ingress decoder retains one documented parameter-level exception: it must
accept raw input so its supplied schema can validate it. This does not exempt
other functions or files from the shared rules.
