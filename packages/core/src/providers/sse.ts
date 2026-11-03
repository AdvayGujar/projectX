export interface SseEvent {
  data: string;
  event?: string;
  id?: string;
}

export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer = normalize(buffer + decoder.decode(value, { stream: true }));
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseBlock(block);
        if (event) {
          yield event;
        }
      }
    }

    buffer = normalize(buffer + decoder.decode());
    const event = parseBlock(buffer);
    if (event) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): SseEvent | null {
  const data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

    if (field === "data") {
      data.push(value);
    } else if (field === "event") {
      event = value;
    } else if (field === "id") {
      id = value;
    }
  }

  return data.length > 0 ? { data: data.join("\n"), event, id } : null;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
