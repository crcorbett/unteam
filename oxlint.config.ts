import { correctness } from "@effect/tsgo/oxlint-presets";
import { Record } from "effect";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [{ ...correctness, rules: Record.map(correctness.rules, (): "error" => "error") }],
  jsPlugins: ["@commonplaces/oxlint-plugin/strict-effect"],
  ignorePatterns: ["**/dist/**", "artifacts/**"],
  rules: {
    "no-explicit-any": "error",
    "no-console": "error",
    "no-non-null-assertion": "error",
    "no-throw-literal": "error",
  },
  overrides: [
    {
      files: [
        "packages/emulator-bun/src/traffic-log.ts",
        "packages/emulator-core/src/events.ts",
        "apps/cli/src/runtime.ts",
      ],
      rules: {
        "strict-effect/static-layers": "error",
        "strict-effect/no-promise-workflow": "error",
        "strict-effect/no-unchecked-json": "error",
      },
    },
  ],
});
