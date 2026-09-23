"use client";

import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useState, type FormEvent } from "react";

import { SUGGESTIONS } from "@/lib/tools";
import type { ChatMessage, Verdict } from "@/lib/types";

type ToolPart = Extract<ChatMessage["parts"][number], { toolCallId: string }>;

export default function Chat() {
  const [input, setInput] = useState("");
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);

  const { messages, sendMessage, addToolApprovalResponse, status, error, stop } = useChat<ChatMessage>({
    // After the user answers an approval request, send the answer back so the agent can continue.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onData: (part) => {
      if (part.type === "data-verdict") setVerdicts((all) => [...all, part.data]);
    },
  });

  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  return (
    <main className="layout">
      <section className="chat">
        <header>
          <h1>TrustGuard × AI SDK</h1>
          <p>Every prompt, answer, tool call and tool result goes through your TrustGuard policy.</p>
        </header>

        <div className="messages">
          {messages.length === 0 && (
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => send(s.prompt)}>
                  <strong>{s.label}</strong>
                  <span>{s.prompt}</span>
                </button>
              ))}
            </div>
          )}

          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              {message.parts.map((part, i) => {
                if (part.type === "text") return <p key={i}>{part.text}</p>;
                if (isToolUIPart(part)) {
                  return <ToolCall key={part.toolCallId} part={part} onAnswer={addToolApprovalResponse} />;
                }
                return null;
              })}
            </article>
          ))}

          {error && <p className="error">{error.message}</p>}
        </div>

        <form onSubmit={onSubmit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask something…" />
          {busy ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
      </section>

      <aside className="verdicts">
        <h2>TrustGuard verdicts</h2>
        {verdicts.length === 0 && <p className="muted">Each evaluation shows up here as it happens.</p>}
        <ol>
          {verdicts.map((v, i) => (
            <li key={i} className={`verdict ${v.status}`}>
              <span className="phase">{v.phase}</span>
              <span className="status">{v.status}</span>
              {v.detail && <span className="detail">{v.detail}</span>}
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}

function ToolCall({
  part,
  onAnswer,
}: {
  part: ToolPart;
  onAnswer: (answer: { id: string; approved: boolean; reason?: string }) => void;
}) {
  return (
    <div className={`tool ${part.state}`}>
      <div className="tool-head">
        <code>{getToolName(part)}</code>
        <span className="muted">{label(part.state)}</span>
      </div>
      <pre>{JSON.stringify(part.input, null, 2)}</pre>

      {part.state === "approval-requested" && (
        <div className="approval">
          <p>{part.approval.requestReason ?? "This call needs your approval."}</p>
          <button onClick={() => onAnswer({ id: part.approval.id, approved: true })}>Allow</button>
          <button onClick={() => onAnswer({ id: part.approval.id, approved: false, reason: "Denied by the user" })}>
            Deny
          </button>
        </div>
      )}
      {part.state === "output-available" && <pre>{JSON.stringify(part.output, null, 2)}</pre>}
      {part.state === "output-error" && <p className="error">{part.errorText}</p>}
    </div>
  );
}

function label(state: ToolPart["state"]): string {
  switch (state) {
    case "approval-requested":
      return "waiting for your approval";
    case "approval-responded":
      return "answered";
    case "output-available":
      return "done";
    case "output-error":
      return "failed";
    case "output-denied":
      return "denied";
    default:
      return "running";
  }
}
