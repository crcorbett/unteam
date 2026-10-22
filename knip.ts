import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // @effect/tsgo owns this compiler-plugin name; it is not a separate import.
  ignoreDependencies: ["@effect/language-service"],
  entry: [
    "packages/emulator-core/src/index.ts",
    "packages/emulator-bun/src/index.ts",
    "apps/cli/src/main.ts",
    "scripts/packed-artifact-proof.ts",
  ],
  project: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts", "scripts/**/*.ts"],
  ignore: ["**/*.test.ts", "scripts/**", "tools/**"],
};

export default config;
