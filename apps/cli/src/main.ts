import { Effect } from "effect";

import { parseArguments, loadConfig } from "./config";
import { runRuntime } from "./runtime";

const help = `unteam - synthetic local Bot Connector emulator

Usage:
  unteam [--config path]

The emulator is unofficial, synthetic, loopback-only, and does not contact Microsoft services.
`;

const program = Effect.gen(function* () {
  const arguments_ = yield* parseArguments(Bun.argv.slice(2));
  if (arguments_.help) {
    yield* Effect.logInfo(help);
    return;
  }
  const config = yield* loadConfig(arguments_);
  yield* runRuntime(config);
});

Effect.runPromise(program).catch(() => {
  process.exitCode = 1;
});
