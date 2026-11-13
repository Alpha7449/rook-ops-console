// Process-wide event bus (survives Next.js dev HMR via globalThis).
import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __rkBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__rkBus) {
    g.__rkBus = new EventEmitter();
    g.__rkBus.setMaxListeners(50);
  }
  return g.__rkBus;
}

export const SNAPSHOT_EVENT = "snapshot";
