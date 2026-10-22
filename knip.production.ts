import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "packages/emulator-core/src/index.ts",
    "packages/emulator-bun/src/index.ts",
    "packages/client/src/service.ts",
    "packages/client/src/live.layer.ts",
    "packages/client/src/test.layer.ts",
    "packages/client/src/schemas.ts",
    "packages/client/src/errors.ts",
    "apps/cli/src/main.ts",
    "scripts/packed-artifact-proof.ts",
  ],
  project: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts", "scripts/**/*.ts"],
  ignore: ["**/*.test.ts", "scripts/**", "tools/**"],
  // @effect/tsgo owns this compiler-plugin name; it is not a separate import.
  ignoreDependencies: ["@effect/language-service", "@effect/vitest", "@types/bun", "vitest"],
};

export default config;
