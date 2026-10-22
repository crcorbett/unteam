import { Context, Effect, Schema } from "effect";

import { ActivityId, BotAppId, ConnectionId, ConversationId, TenantId, UserId } from "./schemas";

const Text = Schema.Trimmed.check(Schema.isMinLength(1));
export const TrafficRunId = Text.pipe(Schema.brand("@unteam/TrafficRunId"));
export type TrafficRunId = typeof TrafficRunId.Type;

export const TrafficEventData = Schema.Union([
  Schema.TaggedStruct("Lifecycle", {
    action: Schema.Literals(["started", "stopped", "reset"]),
    scenario: Text,
  }),
  Schema.TaggedStruct("Http", {
    exchange: Text,
    phase: Schema.Literals(["received", "responded", "interrupted"]),
    method: Text,
    route: Schema.Literals(["openid", "keys", "oauth", "connector", "control", "ready", "unknown"]),
    status: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
  }),
  Schema.TaggedStruct("Message", {
    botAppId: BotAppId,
    direction: Schema.Literals(["received", "sent"]),
    phase: Schema.Literals(["started", "accepted", "rejected", "uncertain", "interrupted"]),
    connectionId: ConnectionId,
    tenantId: TenantId,
    userId: UserId,
    conversationId: ConversationId,
    activityId: Schema.OptionFromNullOr(ActivityId),
    text: Schema.String,
    status: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
  }),
]);
export type TrafficEventData = typeof TrafficEventData.Type;

export const TrafficEvent = Schema.Struct({
  eventVersion: Schema.Literal("unteam.event.v1"),
  runId: TrafficRunId,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  timestamp: Schema.DateTimeUtcFromString,
  data: TrafficEventData,
});
export type TrafficEvent = typeof TrafficEvent.Type;

export interface TrafficEventsService {
  readonly record: (data: TrafficEventData) => Effect.Effect<void>;
}

// Library consumers can omit recording. The standalone CLI always supplies its
// required file recorder before acquiring the server.
export const TrafficEvents = Context.Reference<TrafficEventsService>("@unteam/TrafficEvents", {
  defaultValue: () => ({ record: () => Effect.void }),
});
