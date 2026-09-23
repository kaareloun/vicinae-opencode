import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import os from "node:os";
import { extractMeta, extractTextDelta } from "./lib/jsonl";
import {
  buildRunArgs,
  exportExchanges,
  opencodeBinary,
  type Exchange,
} from "./lib/opencode";

function quoteLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

function renderMarkdown(
  exchanges: Exchange[],
  failed: string | null,
  loadingHistory: boolean,
): string {
  if (loadingHistory && exchanges.length === 0) return "_Loading session…_";
  if (exchanges.length === 0) {
    if (failed)
      return `## No answer\n\n\`\`\`\n${failed.slice(0, 1500)}\n\`\`\`\n`;
    return "_Asking…_";
  }
  const parts: string[] = [];
  exchanges.forEach((ex, i) => {
    const latest = i === exchanges.length - 1;
    const body = ex.a
      ? ex.a
      : latest && failed
        ? `No answer.\n\n\`\`\`\n${failed.slice(0, 1500)}\n\`\`\``
        : "_Thinking…_";
    parts.push(`**You**\n\n${quoteLines(ex.q)}\n\n**OpenCode**\n\n${body}`);
  });
  return parts.join("\n\n---\n\n");
}

export default function ChatView({
  initialPrompt,
  resumeSessionID,
  directory,
  model,
  variant,
  agent,
}: {
  initialPrompt?: string;
  resumeSessionID?: string;
  directory: string;
  model: string;
  variant: string;
  agent: string;
}) {
  const binary = opencodeBinary();
  const { pop } = useNavigation();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(
    Boolean(resumeSessionID),
  );
  const sessionRef = useRef<string | null>(resumeSessionID ?? null);
  const startedRef = useRef(false);
  const aliveRef = useRef(true);
  const sendingRef = useRef(false);
  const childRef = useRef<ReturnType<typeof spawn> | undefined>(undefined);

  const appendDelta = useCallback((delta: string) => {
    if (!aliveRef.current) return;
    setExchanges((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, a: last.a + delta };
      return next;
    });
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) {
        if (!text) showToast({ title: "Type a follow-up first" });
        return;
      }
      sendingRef.current = true;
      setFailed(null);
      setDraft("");
      setExchanges((prev) => [...prev, { q: text, a: "" }]);
      setSending(true);

      const args = buildRunArgs(text, {
        sessionID: sessionRef.current,
        model,
        variant,
        agent,
        directory,
      });

      let child: ReturnType<typeof spawn> | undefined;
      try {
        child = spawn(binary || "opencode", args, {
          cwd: directory || os.homedir(),
        });
        child.stdin?.end();
      } catch (err) {
        sendingRef.current = false;
        setSending(false);
        setFailed(err instanceof Error ? err.message : String(err));
        return;
      }
      childRef.current = child;

      let stderr = "";
      let leftover = "";
      let buf = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        leftover += chunk.toString();
        const lines = leftover.split("\n");
        leftover = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          const meta = extractMeta(t);
          if (meta?.sessionID) sessionRef.current = meta.sessionID;
          const delta = extractTextDelta(t);
          if (delta) {
            buf += delta;
            appendDelta(delta);
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err: Error) => {
        if (!aliveRef.current) return;
        childRef.current = undefined;
        sendingRef.current = false;
        setSending(false);
        setFailed(err.message);
        showToast({ title: "OpenCode failed to start", message: err.message });
      });

      child.on("close", (code: number) => {
        if (!aliveRef.current) return;
        childRef.current = undefined;
        if (leftover.trim()) {
          const delta = extractTextDelta(leftover.trim());
          if (delta) {
            buf += delta;
            appendDelta(delta);
          }
        }
        sendingRef.current = false;
        setSending(false);
        if (!buf) {
          setFailed(
            code !== 0
              ? stderr.trim() || `opencode exited with code ${code}`
              : "opencode returned an empty response.",
          );
        }
      });
    },
    [agent, appendDelta, binary, directory, model, variant],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (resumeSessionID) {
      exportExchanges(resumeSessionID).then((prior) => {
        if (!aliveRef.current) return;
        setExchanges(prior);
        setLoadingHistory(false);
        if (initialPrompt?.trim()) send(initialPrompt);
      });
    } else if (initialPrompt?.trim()) {
      send(initialPrompt);
    }
  }, [initialPrompt, resumeSessionID, send]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      try {
        childRef.current?.kill();
      } catch {
        // already exited
      }
    };
  }, []);

  const newChat = useCallback(() => {
    try {
      childRef.current?.kill();
    } catch {
      // already exited
    }
    pop();
  }, [pop]);

  const markdown = useMemo(
    () => renderMarkdown(exchanges, failed, loadingHistory),
    [exchanges, failed, loadingHistory],
  );

  const last = exchanges[exchanges.length - 1] ?? null;
  const showRetry = Boolean(last && failed && !sending);
  const title =
    exchanges.length > 0
      ? (exchanges[0]?.q ?? "").slice(0, 60) || "Conversation"
      : "New conversation";

  return (
    <List
      navigationTitle="OpenCode chat"
      searchBarPlaceholder="Type a follow-up, Enter to send…"
      searchText={draft}
      filtering={false}
      isShowingDetail
      isLoading={sending || loadingHistory}
      onSearchTextChange={setDraft}
    >
      <List.Item
        id="conversation"
        title={title}
        subtitle={sending ? "Thinking…" : `${model} · ${variant}`}
        icon={Icon.SpeechBubble}
        detail={<List.Item.Detail markdown={markdown} />}
        actions={
          <ActionPanel>
            <Action
              title="Send Follow-up"
              icon={Icon.ArrowRight}
              autoFocus
              onAction={() => send(draft)}
            />
            {showRetry && last ? (
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => send(last.q)}
              />
            ) : null}
            {last?.a ? (
              <Action.CopyToClipboard title="Copy Answer" content={last.a} />
            ) : null}
            <Action
              title="New Chat"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={newChat}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
