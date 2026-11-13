// Server-side config. Machine specifics live in config/local.json (gitignored);
// config/local.example.json documents the shape. Secrets come from .env.local.
import fs from "node:fs";
import path from "node:path";

export interface LocalConfig {
  aiSystemRoot: string;
  paths: {
    odysseusDir: string;
    chromaStartScript: string;
    vtuberDir: string;
    obsExe: string;
    ollamaExe: string;
    n8nComposeFile: string;
    outreachDir: string;
    emailDigestDir: string;
  };
  services: {
    odysseusUrl: string;
    n8nUrl: string;
    ollamaUrl: string;
    chromaUrl: string;
    searxngUrl: string;
  };
  chromaScheduledTask: string;
  vtubeStudioSteamId: string;
  vtsApiPort?: number;
  n8nWorkflowNames: Record<string, string>;
}

export const DEMO = process.env.DEMO === "1" || process.env.NEXT_PUBLIC_DEMO === "1";

/**
 * Repo root. The standalone production bundle runs with cwd inside
 * .next/standalone/, so the deploy scripts pass the real root via env —
 * otherwise config/ and data/ would resolve into the build output (and the
 * SQLite DB would be wiped by every rebuild).
 */
export function appRoot(): string {
  return process.env.ROOK_OPS_ROOT || process.cwd();
}

let cached: LocalConfig | null = null;

export function getConfig(): LocalConfig {
  if (cached) return cached;
  const file = path.join(appRoot(), "config", "local.json");
  const example = path.join(appRoot(), "config", "local.example.json");
  const src = fs.existsSync(file) ? file : example;
  cached = JSON.parse(fs.readFileSync(src, "utf8")) as LocalConfig;
  return cached;
}

export const env = {
  n8nApiKey: () => process.env.N8N_API_KEY ?? "",
  odysseusToken: () => process.env.ODYSSEUS_TOKEN ?? "",
};
