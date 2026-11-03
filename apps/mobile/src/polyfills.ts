import { Buffer as NodeBuffer } from "buffer";
import nodeProcess from "process";

type PolyfillGlobals = typeof globalThis & {
  Buffer?: typeof NodeBuffer;
  process?: typeof nodeProcess;
};

const globals = globalThis as PolyfillGlobals;

if (!globals.Buffer) {
  globals.Buffer = NodeBuffer;
}

if (!globals.process) {
  globals.process = nodeProcess;
}
