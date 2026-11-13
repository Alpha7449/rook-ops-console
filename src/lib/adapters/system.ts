// Host stats: GPU via nvidia-smi, RAM via node:os.
import os from "node:os";
import { runCmd } from "../ps";
import type { SystemStats } from "../types";
import { DEMO } from "../config";
import { demoSystem } from "../demo";

export async function getSystemStats(): Promise<SystemStats> {
  if (DEMO) return demoSystem;
  const ramTotalMB = Math.round(os.totalmem() / 1048576);
  const ramUsedMB = Math.round((os.totalmem() - os.freemem()) / 1048576);
  const stats: SystemStats = { ramTotalMB, ramUsedMB };
  const res = await runCmd("nvidia-smi", ["--query-gpu=name,memory.used,memory.total", "--format=csv,noheader,nounits"], 6000);
  if (res.ok) {
    const line = res.out.trim().split("\n")[0];
    const [name, used, total] = line.split(",").map((s) => s.trim());
    stats.gpuName = name;
    stats.vramUsedMB = parseInt(used, 10);
    stats.vramTotalMB = parseInt(total, 10);
  }
  return stats;
}
