import { describe, expect, it } from "vitest";

import { parseSse } from "../sse";
import type { SseEvent } from "../sse";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of parseSse(streamFrom(chunks))) {
    events.push(event);
  }
  return events;
}

describe("parseSse", () => {
  it("parses a single event", async () => {
    expect(await collect(['data: {"a":1}\n\n'])).toEqual([{ data: '{"a":1}' }]);
  });

  it("parses multiple events in one chunk", async () => {
    const events = await collect(['data: one\n\ndata: two\n\n']);
    expect(events.map((event) => event.data)).toEqual(["one", "two"]);
  });

  it("handles events split across chunks", async () => {
    const events = await collect(['data: {"a"', ':1}\n', "\n"]);
    expect(events).toEqual([{ data: '{"a":1}' }]);
  });

  it("joins multi-line data", async () => {
    const events = await collect(["data: line one\ndata: line two\n\n"]);
    expect(events[0]?.data).toBe("line one\nline two");
  });

  it("normalizes CRLF and ignores comments", async () => {
    const events = await collect([": keepalive\r\n\r\ndata: ok\r\n\r\n"]);
    expect(events).toEqual([{ data: "ok" }]);
  });

  it("keeps event and id fields", async () => {
    const events = await collect(["event: delta\nid: 7\ndata: x\n\n"]);
    expect(events[0]).toEqual({ data: "x", event: "delta", id: "7" });
  });

  it("flushes a final event without a blank line", async () => {
    expect(await collect(["data: last"])).toEqual([{ data: "last" }]);
  });
});
