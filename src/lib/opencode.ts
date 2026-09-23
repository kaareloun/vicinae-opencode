import { getPreferenceValues } from "@vicinae/api";
import { spawn } from "node:child_process";
import os from "node:os";

export const DEFAULT_MODEL = "opencode/big-pickle";
export const DEFAULT_VARIANT = "minimal";
export const DEFAULT_AGENT = "plan";

export interface Prefs {
  binary?: string;
  directory?: string;
  model?: string;
  variant?: string;
  agent?: string;
  "auto-ask"?: boolean;
}

export function prefs(): Prefs {
  try {
    return getPreferenceValues<Prefs>();
  } catch {
    return {};
  }
}

export function resolveHome(p: string): string {
  if (p.startsWith("~/")) return os.homedir() + p.slice(1);
  return p;
}

export function opencodeBinary(): string {
  return prefs().binary?.trim() || "opencode";
}

export function workingDirectory(): string {
  return resolveHome(prefs().directory || os.homedir());
}

export function modelOverride(): string {
  return prefs().model?.trim() || DEFAULT_MODEL;
}

export function variantOverride(): string {
  return prefs().variant?.trim() || DEFAULT_VARIANT;
}

export function agentOverride(): string {
  return prefs().agent?.trim() || DEFAULT_AGENT;
}

export function autoAskEnabled(): boolean {
  return prefs()["auto-ask"] !== false;
}

export interface Exchange {
  q: string;
  a: string;
}

export interface OpencodeSession {
  id: string;
  title: string;
  directory?: string;
  projectId?: string;
  created?: number;
  updated?: number;
}

function runCapture(
  binary: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, { cwd });
    } catch (err) {
      resolve({
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        code: 1,
      });
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: Error) => {
      resolve({ stdout, stderr: stdout + err.message, code: 1 });
    });
    child.on("close", (code: number) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

export const ANSWER_STYLE =
  "Answer concisely: lead with the answer in the fewest words possible, minimal markdown, no preamble or recap.";

export function buildRunArgs(
  prompt: string,
  opts: {
    sessionID?: string | null;
    model?: string;
    variant?: string;
    agent?: string;
    directory?: string;
  },
): string[] {
  const args = ["run", `${prompt}\n\n${ANSWER_STYLE}`, "--format", "json"];
  if (opts.sessionID) args.push("--session", opts.sessionID);
  if (opts.model) args.push("--model", opts.model);
  if (opts.variant) args.push("--variant", opts.variant);
  if (opts.agent) args.push("--agent", opts.agent);
  if (opts.directory) args.push("--dir", opts.directory);
  return args;
}

export async function listSessions(limit = 20): Promise<OpencodeSession[]> {
  const binary = opencodeBinary();
  const cwd = workingDirectory();
  const { stdout, code } = await runCapture(
    binary,
    ["session", "list", "--format", "json", "-n", String(limit)],
    cwd,
  );
  if (code !== 0 || !stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout) as Array<{
      id?: string;
      title?: string;
      directory?: string;
      projectId?: string;
      created?: number;
      updated?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => typeof s?.id === "string")
      .map((s) => ({
        id: s.id as string,
        title:
          typeof s.title === "string" && s.title ? s.title : "Untitled session",
        directory: s.directory,
        projectId: s.projectId,
        created: s.created,
        updated: s.updated,
      }));
  } catch {
    return [];
  }
}

function exportTextOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const texts: string[] = [];
  for (const p of parts) {
    if (
      typeof p === "object" &&
      p !== null &&
      (p as { type?: unknown }).type === "text" &&
      typeof (p as { text?: unknown }).text === "string"
    ) {
      texts.push((p as { text: string }).text);
    }
  }
  return texts.join("\n\n").trim();
}

export async function exportExchanges(sessionID: string): Promise<Exchange[]> {
  const binary = opencodeBinary();
  const cwd = workingDirectory();
  const { stdout, code } = await runCapture(binary, ["export", sessionID], cwd);
  if (code !== 0 || !stdout.trim()) return [];
  try {
    const data = JSON.parse(stdout) as {
      messages?: Array<{
        info?: { role?: string };
        parts?: unknown;
      }>;
    };
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const exchanges: Exchange[] = [];
    for (const m of messages) {
      const role = m?.info?.role;
      const text = exportTextOf(m?.parts);
      if (!text) continue;
      if (role === "user") {
        exchanges.push({ q: text, a: "" });
      } else if (role === "assistant") {
        const last = exchanges[exchanges.length - 1];
        if (last) last.a = last.a ? `${last.a}\n\n${text}` : text;
      }
    }
    return exchanges;
  } catch {
    return [];
  }
}
