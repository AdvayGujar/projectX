import http from "node:http";

const PORT = 8099;
const CHUNKS = 20;

const server = http.createServer((request, response) => {
  if (request.url !== "/v1/chat/completions") {
    response.writeHead(404);
    response.end("not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let index = 0;
  const timer = setInterval(() => {
    index += 1;
    const content = index === 1 ? "stream ok " : `chunk ${index} `;
    const payload = { id: "mock", choices: [{ delta: { content } }] };
    response.write(`data: ${JSON.stringify(payload)}\n\n`);

    if (index >= CHUNKS) {
      response.write("data: [DONE]\n\n");
      clearInterval(timer);
      response.end();
    }
  }, 50);

  request.on("close", () => clearInterval(timer));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`mock SSE server on http://0.0.0.0:${PORT}/v1/chat/completions`);
});
