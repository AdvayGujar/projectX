import { createSessionStoreSink } from "../state/sessionSink";
import { createTurnPort } from "./turnPort";

/**
 * Composition root: the port with the store-backed sink. Screens import this and never see
 * the engine, the provider runtime, or the sink.
 */
export const turnService = createTurnPort(createSessionStoreSink());

export type { TurnInput, TurnPort, TurnSink, TurnUsage } from "./turnPort";
