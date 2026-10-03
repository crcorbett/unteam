import { assert, describe, it } from "@effect/vitest";
import { makeTeamsEmulatorServerFromPaths } from "@unteam/emulator-bun/server";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { ServicePath } from "@unteam/emulator-core/schemas";
import { ConfigProvider, Effect, Exit, Schema } from "effect";

import { UnteamClientLive } from "../src/live.layer";
import { ServerScenarioV1, SetInstallation, UnteamConnectionConfig, UnteamReadyV2 } from "../src/schemas";
import { UnteamClient } from "../src/service";

const scenario = ServerScenarioV1.make({
  ...exampleScenario,
  connections: exampleScenario.connections.map((connection) => ({
    connectionId: connection.connectionId,
    tenantId: connection.tenantId,
    userId: connection.userId,
    conversationId: connection.conversationId,
    servicePath: ServicePath.make(`/connector/${connection.connectionId}/`),
    installation: connection.installation,
    connectorOutcome: connection.connectorOutcome,
    signingKeyId: connection.signingKeyId,
  })),
});

const provider = (origin: string) =>
  ConfigProvider.fromEnv({
    env: { UNTEAM_ORIGIN: origin, UNTEAM_READINESS_TIMEOUT_MILLIS: "2000" },
  });

describe("@unteam/client", () => {
  it.effect("decodes exact loopback config and rejects wrong-version readiness", () =>
    Effect.gen(function* () {
      const valid = yield* Schema.decodeUnknownEffect(UnteamConnectionConfig)({
        origin: "http://127.0.0.1:4311/",
        readinessTimeoutMillis: 2_000,
      });
      const path = yield* Schema.decodeUnknownEffect(UnteamConnectionConfig)({
        origin: "http://127.0.0.1:4311/control/",
        readinessTimeoutMillis: 2_000,
      }).pipe(Effect.exit);
      const publicOrigin = yield* Schema.decodeUnknownEffect(UnteamConnectionConfig)({
        origin: "https://example.invalid/",
        readinessTimeoutMillis: 2_000,
      }).pipe(Effect.exit);
      assert.strictEqual(valid.origin.href, "http://127.0.0.1:4311/");
      assert.isTrue(Exit.isFailure(path));
      assert.isTrue(Exit.isFailure(publicOrigin));
    }),
  );

  it.effect("uses named controls and snapshots over the standalone server boundary", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeTeamsEmulatorServerFromPaths(scenario);
        const client = yield* UnteamClient.pipe(
          Effect.provide(UnteamClientLive),
          Effect.provideService(ConfigProvider.ConfigProvider, provider(server.origin.href)),
        );
        const initial = yield* client.snapshot();
        const control = yield* Schema.decodeUnknownEffect(SetInstallation)({
          controlVersion: "control.v1",
          kind: "set-installation",
          operationId: "client-test-installation",
          connectionId: "connection-a",
          state: "blocked",
        });
        const receipt = yield* client.setInstallation(control);
        const changed = yield* client.snapshot();
        const encodedReadiness = yield* Schema.encodeEffect(UnteamReadyV2)(client.readiness);
        const wrongVersion = yield* Schema.decodeUnknownEffect(UnteamReadyV2)({
          ...encodedReadiness,
          readinessVersion: "unteam.ready.v1",
        }).pipe(Effect.exit);

        assert.strictEqual(client.readiness.readinessVersion, "unteam.ready.v2");
        assert.strictEqual(
          initial.connections.find((connection) => connection.connectionId === "connection-a")?.installation,
          "installed",
        );
        assert.isTrue(receipt.accepted);
        assert.strictEqual(
          changed.connections.find((connection) => connection.connectionId === "connection-a")?.installation,
          "blocked",
        );
        assert.isTrue(Exit.isFailure(wrongVersion));
      }),
    ),
  );
});
