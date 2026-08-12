import { Context, Duration, Effect, HashMap, HashSet, Option, Redacted, SynchronizedRef } from "effect";

import { EmulatorControlError, EmulatorProtocolError, EmulatorStartupError } from "../errors";
import type {
  ConnectionId,
  ConnectionSpec,
  ConnectorOutcome,
  ConnectorRequestV1,
  EmulatorSnapshotV1,
  InstallationState,
  ObservationId,
  ObservationKind,
  ObservationSummaryV1,
  ObservationV1,
  ProtocolJwk,
  ScenarioV1,
  SigningKeyId,
  SimulationDuration,
} from "../schemas";
import {
  ConnectionSnapshotV1,
  EmulatorSnapshotV1 as EmulatorSnapshotSchema,
  ObservationId as ObservationIdSchema,
  ObservationSummaryV1 as ObservationSummarySchema,
  ObservationV1 as ObservationSchema,
} from "../schemas";
import type { ActivitySignerService } from "./activity-signer";

export interface SimulationClockService {
  readonly now: Effect.Effect<number>;
  readonly advance: (duration: SimulationDuration) => Effect.Effect<void>;
  readonly reset: Effect.Effect<void>;
}

export class SimulationClock extends Context.Service<SimulationClock, SimulationClockService>()(
  "@unteam/emulator-core/SimulationClock",
) {}

interface ConnectionState extends ConnectionSpec {
  readonly selectedSigningKeyId: SigningKeyId;
}

interface TokenClaims {
  readonly botAppId: ScenarioV1["bot"]["botAppId"];
  readonly scope: string;
  readonly expiresAtMillis: number;
}

interface TokenRecord extends TokenClaims {
  readonly token: string;
}

interface State {
  readonly connections: HashMap.HashMap<ConnectionId, ConnectionState>;
  readonly signingKeys: HashSet.HashSet<SigningKeyId>;
  readonly seenActivities: HashSet.HashSet<string>;
  readonly tokens: HashMap.HashMap<string, TokenRecord>;
  readonly observations: readonly ObservationV1[];
  readonly connectorRequests: readonly ConnectorRequestV1[];
  readonly jwkRequestCount: number;
  readonly oauthRequestCount: number;
  readonly connectorRequestCount: number;
  readonly controlDeliveryRequestCount: number;
  readonly observationTotal: number;
  readonly observationsTruncated: boolean;
  readonly nextObservation: number;
  readonly nextToken: number;
  readonly prunedTokens: number;
}

interface ObservationInput {
  readonly kind: ObservationKind;
  readonly detail: ObservationV1["detail"];
  readonly connectionId?: ConnectionId;
  readonly status?: number;
}

interface TokenIssue {
  readonly token: string;
  readonly expiresInSeconds: number;
}

export interface ProtocolStateService {
  readonly scenario: ScenarioV1;
  readonly readConnection: (connectionId: ConnectionId) => Effect.Effect<Option.Option<ConnectionState>>;
  readonly readConnections: Effect.Effect<readonly ConnectionState[]>;
  readonly readSigningKeys: Effect.Effect<readonly ProtocolJwk[]>;
  readonly readSelectedSigningKey: (
    connectionId: ConnectionId,
  ) => Effect.Effect<SigningKeyId, EmulatorControlError>;
  readonly setInstallation: (
    connectionId: ConnectionId,
    installation: InstallationState,
  ) => Effect.Effect<void, EmulatorControlError>;
  readonly setConnectorOutcome: (
    connectionId: ConnectionId,
    outcome: ConnectorOutcome,
  ) => Effect.Effect<void, EmulatorControlError>;
  readonly selectSigningKey: (
    connectionId: ConnectionId,
    keyId: SigningKeyId,
  ) => Effect.Effect<void, EmulatorControlError>;
  readonly markActivity: (activityId: string) => Effect.Effect<"new" | "duplicate">;
  readonly issueToken: (
    clientId: string,
    clientSecret: string,
    scope: string,
  ) => Effect.Effect<TokenIssue, EmulatorProtocolError>;
  readonly readToken: (token: string) => Effect.Effect<Option.Option<TokenClaims>>;
  readonly recordObservation: (input: ObservationInput) => Effect.Effect<ObservationId>;
  readonly recordJwkRequest: Effect.Effect<void>;
  readonly recordConnectorRequest: (request: ConnectorRequestV1) => Effect.Effect<void>;
  readonly recordControlDelivery: Effect.Effect<void>;
  readonly snapshot: Effect.Effect<EmulatorSnapshotV1>;
  readonly reset: Effect.Effect<void>;
  readonly now: Effect.Effect<number>;
  readonly advance: (duration: SimulationDuration) => Effect.Effect<void>;
}

export class ProtocolState extends Context.Service<ProtocolState, ProtocolStateService>()(
  "@unteam/emulator-core/ProtocolState",
) {}

const emptyState = (scenario: ScenarioV1): State => ({
  connections: HashMap.fromIterable(
    scenario.connections.map(
      (connection) =>
        [connection.connectionId, { ...connection, selectedSigningKeyId: connection.signingKeyId }] as const,
    ),
  ),
  signingKeys: HashSet.fromIterable(scenario.signingKeys.map((key) => key.keyId)),
  seenActivities: HashSet.empty(),
  tokens: HashMap.empty(),
  observations: [],
  connectorRequests: [],
  jwkRequestCount: 0,
  oauthRequestCount: 0,
  connectorRequestCount: 0,
  controlDeliveryRequestCount: 0,
  observationTotal: 0,
  observationsTruncated: false,
  nextObservation: 1,
  nextToken: 1,
  prunedTokens: 0,
});

const validateScenario = (scenario: ScenarioV1): Effect.Effect<void, EmulatorStartupError> => {
  let connectionIds: readonly string[] = [];
  for (const connection of scenario.connections) {
    if (connectionIds.includes(connection.connectionId)) {
      return Effect.fail(new EmulatorStartupError({ code: "duplicate-connection" }));
    }
    connectionIds = [...connectionIds, connection.connectionId];
    if (!scenario.signingKeys.some((key) => key.keyId === connection.signingKeyId)) {
      return Effect.fail(new EmulatorStartupError({ code: "missing-selected-key" }));
    }
  }
  let signingKeyIds: readonly string[] = [];
  for (const key of scenario.signingKeys) {
    if (signingKeyIds.includes(key.keyId)) {
      return Effect.fail(new EmulatorStartupError({ code: "duplicate-signing-key" }));
    }
    signingKeyIds = [...signingKeyIds, key.keyId];
  }
  if (scenario.profile.protocol !== "bot-connector" || scenario.profile.revision !== "v3") {
    return Effect.fail(new EmulatorStartupError({ code: "unsupported-profile" }));
  }
  return Effect.void;
};

const pruneTokens = (state: State, nowMillis: number): State => {
  const live: Array<[string, TokenRecord]> = [];
  let pruned = state.prunedTokens;
  for (const [token, record] of HashMap.entries(state.tokens)) {
    if (record.expiresAtMillis > nowMillis) live.push([token, record]);
    else pruned += 1;
  }
  return { ...state, tokens: HashMap.fromIterable(live), prunedTokens: pruned };
};

const observationSummary = (state: State, capacity: number): ObservationSummaryV1 =>
  ObservationSummarySchema.make({
    observationVersion: "observation.v1",
    capacity,
    total: state.observationTotal,
    truncated: state.observationsTruncated,
    items: state.observations,
  });

export const makeProtocolState = (
  scenario: ScenarioV1,
  clock: SimulationClockService,
  signer: ActivitySignerService,
): Effect.Effect<ProtocolStateService, EmulatorStartupError> =>
  Effect.gen(function* () {
    yield* validateScenario(scenario);
    const state = yield* SynchronizedRef.make<State>(emptyState(scenario));

    const now = clock.now.pipe(
      Effect.tap((nowMillis) => SynchronizedRef.update(state, (current) => pruneTokens(current, nowMillis))),
    );

    const readConnection = (connectionId: ConnectionId) =>
      SynchronizedRef.get(state).pipe(
        Effect.map((current) => HashMap.get(current.connections, connectionId)),
      );

    const readConnections = SynchronizedRef.get(state).pipe(
      Effect.map((current) => HashMap.toValues(current.connections)),
    );

    const signingKeys = yield* signer.publicKeys.pipe(
      Effect.mapError(() => new EmulatorStartupError({ code: "unsupported-profile" })),
    );
    const readSigningKeys = Effect.succeed(signingKeys);

    const updateConnection = (
      connectionId: ConnectionId,
      update: (connection: ConnectionState) => ConnectionState,
    ) =>
      SynchronizedRef.modify(state, (current) => {
        const connection = HashMap.get(current.connections, connectionId);
        if (connection._tag === "None") {
          return [new EmulatorControlError({ code: "unknown-connection" }), current] as const;
        }
        return [
          undefined,
          {
            ...current,
            connections: HashMap.set(current.connections, connectionId, update(connection.value)),
          },
        ] as const;
      }).pipe(Effect.flatMap((error) => (error === undefined ? Effect.void : Effect.fail(error))));

    const markActivity = (activityId: string) =>
      SynchronizedRef.modify(state, (current) => {
        if (HashSet.has(current.seenActivities, activityId)) {
          return ["duplicate" as const, current];
        }
        return [
          "new" as const,
          { ...current, seenActivities: HashSet.add(current.seenActivities, activityId) },
        ];
      });

    const recordObservation = (input: ObservationInput) =>
      SynchronizedRef.modify(state, (current) => {
        const observationId = ObservationIdSchema.make(`observation-${current.nextObservation}`);
        const observation = ObservationSchema.make({
          observationVersion: "observation.v1",
          observationId,
          kind: input.kind,
          detail: input.detail,
          ...(input.connectionId === undefined ? {} : { connectionId: input.connectionId }),
          ...(input.status === undefined ? {} : { status: input.status }),
        });
        const items =
          current.observations.length < scenario.observationCapacity
            ? [...current.observations, observation]
            : current.observations;
        return [
          observationId,
          {
            ...current,
            observations: items,
            observationTotal: current.observationTotal + 1,
            observationsTruncated:
              current.observationsTruncated || current.observations.length >= scenario.observationCapacity,
            nextObservation: current.nextObservation + 1,
          },
        ] as const;
      });

    const issueToken = (clientId: string, clientSecret: string, scope: string) =>
      Effect.gen(function* () {
        yield* SynchronizedRef.update(state, (current) => ({
          ...current,
          oauthRequestCount: current.oauthRequestCount + 1,
        }));
        const nowMillis = yield* now;
        if (
          clientId !== scenario.bot.botAppId ||
          clientSecret !== Redacted.value(scenario.bot.clientSecret)
        ) {
          yield* recordObservation({ kind: "oauth-request", detail: "invalid-client", status: 401 });
          return yield* new EmulatorProtocolError({ code: "invalid-client", status: 401 });
        }
        if (scope !== scenario.bot.scope) {
          yield* recordObservation({ kind: "oauth-request", detail: "invalid-scope", status: 403 });
          return yield* new EmulatorProtocolError({ code: "invalid-scope", status: 403 });
        }
        const token = `synthetic-token-${yield* SynchronizedRef.modify(state, (current) => [current.nextToken, { ...current, nextToken: current.nextToken + 1 }])}`;
        const record: TokenRecord = {
          token,
          botAppId: scenario.bot.botAppId,
          scope,
          expiresAtMillis: nowMillis + Duration.toMillis(Duration.hours(1)),
        };
        yield* SynchronizedRef.update(state, (current) => ({
          ...current,
          tokens: HashMap.set(current.tokens, token, record),
        }));
        yield* recordObservation({ kind: "oauth-request", detail: "accepted", status: 200 });
        return { token, expiresInSeconds: 3_600 } satisfies TokenIssue;
      });

    const readToken = (token: string) =>
      now.pipe(
        Effect.flatMap(() =>
          SynchronizedRef.get(state).pipe(Effect.map((current) => HashMap.get(current.tokens, token))),
        ),
      );

    const reset = SynchronizedRef.set(state, emptyState(scenario)).pipe(Effect.andThen(clock.reset));

    const snapshot = Effect.gen(function* () {
      const simulatedAtMillis = yield* now;
      const current = yield* SynchronizedRef.get(state);
      const connections = HashMap.toValues(current.connections).map((connection) =>
        ConnectionSnapshotV1.make({
          connectionId: connection.connectionId,
          tenantId: connection.tenantId,
          userId: connection.userId,
          conversationId: connection.conversationId,
          serviceUrl: connection.serviceUrl,
          installation: connection.installation,
          connectorOutcome: connection.connectorOutcome,
          selectedSigningKeyId: connection.selectedSigningKeyId,
        }),
      );
      return EmulatorSnapshotSchema.make({
        snapshotVersion: "snapshot.v1",
        profile: scenario.profile,
        botAppId: scenario.bot.botAppId,
        simulatedAtMillis,
        connections,
        activeTokenCount: HashMap.size(current.tokens),
        prunedTokenCount: current.prunedTokens,
        seenActivityCount: HashSet.size(current.seenActivities),
        protocol: {
          jwkRequestCount: current.jwkRequestCount,
          oauthRequestCount: current.oauthRequestCount,
          connectorRequestCount: current.connectorRequestCount,
          controlDeliveryRequestCount: current.controlDeliveryRequestCount,
        },
        connectorRequests: current.connectorRequests,
        observations: observationSummary(current, scenario.observationCapacity),
      });
    });

    return {
      scenario,
      readConnection,
      readConnections,
      readSigningKeys,
      readSelectedSigningKey: (connectionId) =>
        readConnection(connectionId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new EmulatorControlError({ code: "unknown-connection" })),
              onSome: (connection) => Effect.succeed(connection.selectedSigningKeyId),
            }),
          ),
        ),
      setInstallation: (connectionId, installation) =>
        updateConnection(connectionId, (connection) => ({ ...connection, installation })),
      setConnectorOutcome: (connectionId, connectorOutcome) =>
        updateConnection(connectionId, (connection) => ({ ...connection, connectorOutcome })),
      selectSigningKey: (connectionId, keyId) =>
        Effect.gen(function* () {
          const current = yield* SynchronizedRef.get(state);
          if (!HashSet.has(current.signingKeys, keyId)) {
            return yield* new EmulatorControlError({ code: "unknown-signing-key" });
          }
          return yield* updateConnection(connectionId, (connection) => ({
            ...connection,
            selectedSigningKeyId: keyId,
          }));
        }),
      markActivity,
      issueToken,
      readToken,
      recordObservation,
      recordJwkRequest: SynchronizedRef.update(state, (current) => ({
        ...current,
        jwkRequestCount: current.jwkRequestCount + 1,
      })),
      recordConnectorRequest: (request) =>
        SynchronizedRef.update(state, (current) => ({
          ...current,
          connectorRequests:
            current.connectorRequests.length < scenario.observationCapacity
              ? [...current.connectorRequests, request]
              : current.connectorRequests,
          connectorRequestCount: current.connectorRequestCount + 1,
        })),
      recordControlDelivery: SynchronizedRef.update(state, (current) => ({
        ...current,
        controlDeliveryRequestCount: current.controlDeliveryRequestCount + 1,
      })),
      snapshot,
      reset,
      now,
      advance: (duration) =>
        Effect.gen(function* () {
          yield* clock.advance(duration);
          yield* now;
        }),
    } satisfies ProtocolStateService;
  });
