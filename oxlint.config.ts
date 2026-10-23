import { Function as EffectFunction } from "effect";
import { strict } from "@commonplaces/oxlint-plugin";
import { correctness } from "@effect/tsgo/oxlint-presets";
import { Record } from "effect";
import { defineConfig } from "oxlint";
export default defineConfig({
  extends: [
    strict,
    {
      ...correctness,
      rules: EffectFunction.pipe(
        correctness.rules,
        Record.map((): "error" => "error"),
      ),
    },
  ],
  jsPlugins: ["@commonplaces/oxlint-plugin/strict-effect"],
  ignorePatterns: ["**/dist/**", "artifacts/**"],
  rules: {
    // Web Crypto has a Promise API; this exact adapter converts each rejection.
    // Async functions and Promise chains remain forbidden in this file.
    "strict-effect/no-promise-workflow": [
      "error",
      { allowedFiles: ["packages/emulator-core/src/internal/activity-signer.ts"] },
    ],
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
