// Ollama control: liveness, loaded models (VRAM), unload, start/stop.
import { getConfig } from "../config";
import { fetchJson } from "../net";
import { runCmd, runPs, spawnDetached } from "../ps";

const ollamaExe = () => getConfig().paths.ollamaExe || "ollama";

interface PsResponse {
  models?: { name: string; size_vram?: number; size?: number }[];
}

export async function loadedModels(): Promise<{ name: string; vramMB: number }[]> {
  try {
    const data = await fetchJson<PsResponse>(`${getConfig().services.ollamaUrl}/api/ps`, undefined, 2500);
    return (data.models ?? []).map((m) => ({
      name: m.name,
      vramMB: Math.round((m.size_vram ?? m.size ?? 0) / 1048576),
    }));
  } catch {
    return [];
  }
}

export async function ollamaDetail(): Promise<string | undefined> {
  const models = await loadedModels();
  if (!models.length) return "no models loaded";
  const vram = models.reduce((a, m) => a + m.vramMB, 0);
  return `${models.map((m) => m.name).join(", ")} · ${(vram / 1024).toFixed(1)} GB VRAM`;
}

/** Unload every loaded model (frees VRAM without killing the server). */
export async function unloadAllModels(): Promise<string[]> {
  const models = await loadedModels();
  for (const m of models) {
    await runCmd(ollamaExe(), ["stop", m.name], 20000);
  }
  return models.map((m) => m.name);
}

export async function startOllama() {
  spawnDetached(ollamaExe(), ["serve"]);
}

export async function stopOllama() {
  await unloadAllModels();
  await runPs(`Stop-Process -Name 'ollama','ollama app' -Force -ErrorAction SilentlyContinue`);
}
