import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";

import { CliConfigError, loadConfig, parseArguments } from "../src/config";

describe("unteam CLI host", () => {
  it.effect("decodes provider defaults and closed command arguments", () =>
    Effect.gen(function* () {
      const arguments_ = yield* parseArguments(["--help"]);
      assert.isTrue(arguments_.help);
      assert.isTrue(Option.isNone(arguments_.configPath));

      const config = yield* loadConfig(arguments_);
      assert.strictEqual(config.name, "unteam");

      const missingValue = yield* parseArguments(["--config"]).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(missingValue));
    }),
  );

  it.effect("returns a typed file-read failure for an unavailable config path", () =>
    Effect.gen(function* () {
      const result = yield* loadConfig({
        help: false,
        configPath: Option.some("/tmp/unteam-config-that-does-not-exist.json"),
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(result));
      if (Exit.isFailure(result)) {
        const reason = result.cause.reasons[0];
        const failure = reason !== undefined && Cause.isFailReason(reason) ? reason.error : undefined;
        assert.isTrue(failure instanceof CliConfigError);
        if (failure instanceof CliConfigError) assert.strictEqual(failure.code, "file-read");
      }
    }),
  );
});
