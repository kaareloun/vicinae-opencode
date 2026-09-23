import { useCallback, useEffect, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  useNavigation,
} from "@vicinae/api";
import ChatView from "./chat";
import {
  agentOverride,
  autoAskEnabled,
  listSessions,
  modelOverride,
  variantOverride,
  workingDirectory,
  type OpencodeSession,
} from "./lib/opencode";

const AUTOSUBMIT_WINDOW_MS = 1000;
const SESSION_LIMIT = 20;

function sessionSubtitle(s: OpencodeSession): string {
  const when = s.updated ? new Date(s.updated).toLocaleString() : "";
  const where = s.directory ?? "";
  return [where, when].filter(Boolean).join(" · ");
}

export default function Ask() {
  const { push } = useNavigation();
  const [directory] = useState(workingDirectory);
  const [model] = useState(modelOverride);
  const [variant] = useState(variantOverride);
  const [agent] = useState(agentOverride);
  const [autoAsk] = useState(autoAskEnabled);

  const [searchText, setSearchText] = useState("");
  const [sessions, setSessions] = useState<OpencodeSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const mountedAt = useRef(Date.now());
  const autoDone = useRef(false);

  const refreshSessions = useCallback(() => {
    setLoadingSessions(true);
    listSessions(SESSION_LIMIT).then((list) => {
      setSessions(list);
      setLoadingSessions(false);
    });
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const ask = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) {
        showToast({ title: "Type a question first" });
        return;
      }
      push(
        <ChatView
          initialPrompt={q}
          directory={directory}
          model={model}
          variant={variant}
          agent={agent}
        />,
      );
    },
    [agent, directory, model, push, variant],
  );

  const resume = useCallback(
    (session: OpencodeSession) => {
      push(
        <ChatView
          resumeSessionID={session.id}
          directory={directory}
          model={model}
          variant={variant}
          agent={agent}
        />,
      );
    },
    [agent, directory, model, push, variant],
  );

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (
      autoAsk &&
      !autoDone.current &&
      text.trim().length >= 2 &&
      Date.now() - mountedAt.current < AUTOSUBMIT_WINDOW_MS
    ) {
      autoDone.current = true;
      ask(text);
    }
  };

  const q = searchText.trim();

  return (
    <List
      navigationTitle="Ask OpenCode"
      searchBarPlaceholder="Ask OpenCode anything…"
      searchText={searchText}
      filtering={false}
      isLoading={loadingSessions}
      onSearchTextChange={handleSearchChange}
      actions={
        <ActionPanel>
          <Action
            title="Refresh Sessions"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={refreshSessions}
          />
        </ActionPanel>
      }
    >
      <List.Section title="Ask">
        <List.Item
          title={q ? `Ask: ${q}` : "Type a question…"}
          subtitle={`${model} · ${variant}`}
          icon={Icon.SpeechBubble}
          actions={
            <ActionPanel>
              <Action
                title="Ask OpenCode"
                icon={Icon.SpeechBubble}
                onAction={() => ask(searchText)}
              />
              <Action
                title="Refresh Sessions"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={refreshSessions}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      {sessions.length > 0 ? (
        <List.Section title="Recent sessions">
          {sessions.map((session) => (
            <List.Item
              key={session.id}
              title={session.title}
              subtitle={sessionSubtitle(session)}
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action
                    title="Continue Session"
                    icon={Icon.ArrowRight}
                    onAction={() => resume(session)}
                  />
                  <Action.CopyToClipboard
                    title="Copy Session ID"
                    content={session.id}
                  />
                  <Action
                    title="Refresh Sessions"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={refreshSessions}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
      {!q && sessions.length === 0 && !loadingSessions ? (
        <List.EmptyView
          title="Ask OpenCode anything"
          description="Type in the search bar above and hit Enter. Tip: set this command as a fallback to ask straight from root search."
          icon={Icon.SpeechBubble}
        />
      ) : null}
    </List>
  );
}
