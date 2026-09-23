export interface RunTokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

// Parse `opencode run --format json` (newline-delimited events) into text.
export function extractTextDelta(line: string): string | null {
  try {
    const evt = JSON.parse(line) as {
      type?: string;
      part?: { type?: string; text?: string };
    };
    if (evt.type === "text" && typeof evt.part?.text === "string") {
      return evt.part.text;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractMeta(line: string): {
  sessionID?: string;
  tokens?: RunTokenUsage;
} | null {
  try {
    const evt = JSON.parse(line) as {
      type?: string;
      sessionID?: string;
      part?: { tokens?: RunTokenUsage };
    };
    if (evt.type === "step_finish") {
      return { sessionID: evt.sessionID, tokens: evt.part?.tokens };
    }
    if (evt.type === "step_start") {
      return { sessionID: evt.sessionID };
    }
    return null;
  } catch {
    return null;
  }
}
