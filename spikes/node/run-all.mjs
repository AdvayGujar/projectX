import { run as runDocx } from "./docx.mjs";
import { run as runPptx } from "./pptx.mjs";
import { run as runXlsx } from "./xlsx.mjs";

const checks = [
  ["pptxgenjs", runPptx],
  ["xlsx", runXlsx],
  ["docx", runDocx],
];

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const results = [];

for (const [label, run] of checks) {
  const started = Date.now();
  try {
    const result = await run();
    results.push({ ...result, label, ms: Date.now() - started });
  } catch (error) {
    results.push({ label, ok: false, error: error.message, ms: Date.now() - started });
  }
}

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  const detail = result.ok
    ? `${formatSize(result.size)} · ${result.detail}`
    : result.error;
  console.log(`${status}  ${result.label.padEnd(10)} ${String(result.ms).padStart(5)} ms  ${detail}`);
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
