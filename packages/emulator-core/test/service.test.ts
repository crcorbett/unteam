import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Exit, Layer, Option, Redacted, Schema } from "effect";

import { exampleScenario } from "../src/fixtures";
import { makeTeamsEmulatorTestLayer } from "../src/live.layer";
import { TeamsEmulator } from "../src/service";
import { ActivitySigner, testLayer as deterministicSignerLayer } from "../src/internal/activity-signer";
import { ProtocolState } from "../src/internal/protocol-state";
import {
  AdvanceSimulationTime,
  ActivityId,
  DeliverActivity,
  DurationFromMillis,
  OperationId,
  ScenarioV1,
  ResetControl,
  decodeExact,
  deliverActivityKeys,
} from "../src/schemas";

const decodeActivity = (operationId: string, activityId: string, ingressUrl: string) =>
  Schema.decodeUnknownSync(DeliverActivity)({
    controlVersion: "control.v1",
    kind: "deliver-activity",
    operationId,
    connectionId: "connection-a",
    activityId,
    text: "bounded",
    ingressUrl,
  });

describe("emulator-core contract", () => {
  it.effect("decodes independent versions, bounds, and excess properties exactly", () =>
    Effect.gen(function* () {
      const rawScenario = {
        ...exampleScenario,
        bot: {
          ...exampleScenario.bot,
          clientSecret: Redacted.value(exampleScenario.bot.clientSecret),
        },
        connections: exampleScenario.connections.map((item) => ({
          ...item,
          serviceUrl: item.serviceUrl.href,
        })),
      };
      const scenario = yield* Schema.decodeUnknownEffect(ScenarioV1)(rawScenario);
      assert.strictEqual(scenario.scenarioVersion, "scenario.v1");
      const valid = yield* decodeExact(DeliverActivity, deliverActivityKeys, {
        controlVersion: "control.v1",
        kind: "deliver-activity",
        operationId: "op-1",
        connectionId: "connection-a",
        activityId: "activity-1",
        text: "hello",
        ingressUrl: "http://127.0.0.1:1234/ingress",
      });
      assert.strictEqual(valid.controlVersion, "control.v1");
      const extra = yield* decodeExact(DeliverActivity, deliverActivityKeys, {
        controlVersion: "control.v1",
        kind: "deliver-activity",
        operationId: "op-1",
        connectionId: "connection-a",
        activityId: "activity-1",
        text: "hello",
        ingressUrl: "http://127.0.0.1:1234/ingress",
        unexpected: true,
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(extra));
      const tooLong = yield* decodeExact(DeliverActivity, deliverActivityKeys, {
        controlVersion: "control.v1",
        kind: "deliver-activity",
        operationId: "op-1",
        connectionId: "connection-a",
        activityId: "activity-1",
        text: "x".repeat(4097),
        ingressUrl: "http://127.0.0.1:1234/ingress",
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(tooLong));
      const duration = Schema.decodeUnknownSync(DurationFromMillis)(1_000);
      assert.isTrue(Duration.isPositive(duration));
      const invalidDuration = Schema.decodeUnknownExit(DurationFromMillis)(0);
      assert.isTrue(Exit.isFailure(invalidDuration));
    }),
  );

  it.effect("keeps state isolated, observations bounded, and reset deterministic", () => {
    const scenario = { ...exampleScenario, observationCapacity: 2 };
    return Effect.gen(function* () {
      const emulator = yield* TeamsEmulator;
      const ingressUrl = "http://example.invalid/ingress";
      for (const index of Array.from({ length: 5 }, (_, value) => value)) {
        const result = yield* emulator
          .deliverActivity(decodeActivity(`op-${index}`, `activity-${index}`, ingressUrl))
          .pipe(Effect.exit);
        assert.isTrue(Exit.isFailure(result));
      }
      const beforeReset = yield* emulator.snapshot;
      assert.strictEqual(beforeReset.observations.total, 5);
      assert.strictEqual(beforeReset.observations.items.length, 2);
      assert.isTrue(beforeReset.observations.truncated);
      const advance = yield* emulator.advanceTime(
        Schema.decodeUnknownSync(AdvanceSimulationTime)({
          controlVersion: "control.v1",
          kind: "advance-time",
          operationId: "advance-1",
          duration: 60_000,
        }),
      );
      assert.strictEqual(advance.accepted, true);
      yield* emulator.reset(
        Schema.decodeUnknownSync(ResetControl)({
          controlVersion: "control.v1",
          kind: "reset",
          operationId: "reset-1",
        }),
      );
      const afterReset = yield* emulator.snapshot;
      assert.strictEqual(afterReset.observations.total, 0);
      assert.strictEqual(afterReset.seenActivityCount, 0);
    }).pipe(Effect.provide(makeTeamsEmulatorTestLayer(scenario)));
  });

  it.effect("records duplicate activity as a replay without a second attempt", () =>
    Effect.gen(function* () {
      const emulator = yield* TeamsEmulator;
      const input = decodeActivity("op-duplicate", "activity-duplicate", "http://127.0.0.1:1234/ingress");
      const first = yield* emulator.deliverActivity(input);
      const second = yield* emulator.deliverActivity({
        ...input,
        operationId: Schema.decodeUnknownSync(OperationId)("op-duplicate-2"),
      });
      assert.strictEqual(first.result, "uncertain");
      assert.strictEqual(second.result, "duplicate");
      assert.strictEqual(second.attempts, 0);
    }).pipe(Effect.provide(makeTeamsEmulatorTestLayer(exampleScenario))),
  );

  it.effect("uses a deterministic signer and prunes expired tokens under the test clock", () =>
    Effect.gen(function* () {
      const signer = yield* ActivitySigner;
      const state = yield* ProtocolState;
      const key = exampleScenario.signingKeys[0];
      const connection = exampleScenario.connections[0];
      if (key === undefined || connection === undefined)
        return yield* Effect.die("test fixture is incomplete");
      const signingInput = {
        keyId: key.keyId,
        issuer: new URL("http://127.0.0.1:9000"),
        audience: exampleScenario.bot.botAppId,
        tokenServiceUrl: connection.serviceUrl,
        activityServiceUrl: connection.serviceUrl,
        tenantId: connection.tenantId,
        userId: connection.userId,
        conversationId: connection.conversationId,
        activityId: Schema.decodeUnknownSync(ActivityId)("deterministic-activity"),
        text: "deterministic",
        nowMillis: exampleScenario.initialTimeMillis,
      };
      const first = yield* signer.sign(signingInput);
      const second = yield* signer.sign(signingInput);
      assert.strictEqual(first.token, second.token);
      const keys = yield* signer.publicKeys;
      assert.deepEqual(
        keys.map((item) => item.kid),
        ["key-a", "key-b"],
      );

      const issued = yield* state.issueToken(
        exampleScenario.bot.botAppId,
        Redacted.value(exampleScenario.bot.clientSecret),
        exampleScenario.bot.scope,
      );
      const active = yield* state.snapshot;
      assert.strictEqual(active.activeTokenCount, 1);
      yield* state.advance(Schema.decodeUnknownSync(DurationFromMillis)(3_600_001));
      const token = yield* state.readToken(issued.token);
      assert.isTrue(Option.isNone(token));
      const pruned = yield* state.snapshot;
      assert.strictEqual(pruned.activeTokenCount, 0);
      assert.strictEqual(pruned.prunedTokenCount, 1);
    }).pipe(
      Effect.provide(
        Layer.merge(
          makeTeamsEmulatorTestLayer(exampleScenario),
          deterministicSignerLayer(exampleScenario.signingKeys),
        ),
      ),
    ),
  );
});
