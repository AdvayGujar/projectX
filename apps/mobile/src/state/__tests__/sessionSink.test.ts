import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../sessionsStore", () => ({
  useSessionsStore: { getState: () => ({ refresh: jest.fn(async () => undefined) }) },
}));

import { createSessionStoreSink } from "../sessionSink";
import { useSessionStore } from "../sessionStore";

const store = () => useSessionStore.getState();
const sink = createSessionStoreSink();

beforeEach(() => {
  store().beginSession("session-1", "Title", []);
});

describe("session sink", () => {
  it("marks the session as streaming when a turn starts", () => {
    sink.onUserTurn("user-1", "hello");

    expect(store().streaming).toBe(true);
    expect(store().turns).toEqual([{ id: "user-1", role: "user", text: "hello" }]);
  });

  it("clears streaming when the turn settles", () => {
    sink.onUserTurn("user-1", "hello");
    sink.onSettled();

    expect(store().streaming).toBe(false);
  });
});
