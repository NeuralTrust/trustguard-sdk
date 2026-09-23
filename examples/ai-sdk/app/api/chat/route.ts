import { openai } from "@ai-sdk/openai";
import { TrustGuard, type GuardResponse } from "@neuraltrust/trustguard-sdk";
import { trustguard, TrustGuardBlockedError } from "@neuraltrust/trustguard-sdk/ai-sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  wrapLanguageModel,
} from "ai";

import { tools } from "@/lib/tools";
import type { ChatMessage, Verdict } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM = [
  "You are a helpful assistant with three tools: getWeather, readPage, and sendEmail.",
  "Use readPage for any URL the user mentions. Keep answers short.",
].join(" ");

let client: TrustGuard | undefined;

/** One client per process, created on the first request so a build without the variables still succeeds. */
function trustGuardClient(): TrustGuard {
  client ??= new TrustGuard({
    baseUrl: required("TRUSTGUARD_BASE_URL"),
    apiKey: required("TRUSTGUARD_API_KEY"),
  });
  return client;
}

export async function POST(req: Request) {
  const { id, messages }: { id: string; messages: ChatMessage[] } = await req.json();

  // Replace with the signed-in user from your auth. Findings in Activity are grouped under it.
  const consumerId = req.headers.get("x-demo-user") ?? "demo-user";

  const stream = createUIMessageStream<ChatMessage>({
    // Continue the same assistant message when the browser sends back an approval.
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Every verdict also goes to the browser, so the side panel shows what TrustGuard decided.
      const report = (verdict: Verdict) => writer.write({ type: "data-verdict", data: verdict, transient: true });

      // One instance per request: every evaluation carries this user and this conversation.
      const tg = trustguard(trustGuardClient(), {
        consumerId,
        sessionId: id,
        stream: process.env.TRUSTGUARD_STREAM === "buffer" ? "buffer" : "monitor",
        onVerdict: ({ phase, response }) => report({ phase, ...summarize(response) }),
        onError: ({ phase, error }) =>
          report({ phase, status: "error", detail: error instanceof Error ? error.message : String(error) }),
      });

      const result = streamText({
        model: wrapLanguageModel({
          model: openai(process.env.OPENAI_MODEL ?? "gpt-5.2"),
          middleware: tg.middleware,
        }),
        system: SYSTEM,
        messages: await convertToModelMessages(messages),
        tools: tg.tools(tools),
        toolApproval: tg.toolApproval,
        // The approval comes back inside the message history the browser sends, so sign each
        // request: a client cannot then approve a call the server never asked about, or change
        // its arguments. When the answer arrives, the AI SDK calls toolApproval again, so a call
        // TrustGuard now blocks stays denied even after the user allowed it.
        experimental_toolApprovalSecret: required("TOOL_APPROVAL_SECRET"),
        stopWhen: isStepCount(5),
      });

      writer.merge(result.toUIMessageStream({ onError: describe }));
    },
    onError: describe,
  });

  return createUIMessageStreamResponse({ stream });
}

/** The AI SDK hides error messages from the browser. A TrustGuard block is safe to show and says why. */
function describe(error: unknown): string {
  return error instanceof TrustGuardBlockedError ? error.message : "Something went wrong. Check the server logs.";
}

function summarize(response: GuardResponse): Omit<Verdict, "phase"> {
  const finding = response.findings.find((f) => f.outcome?.action) ?? response.findings[0];
  const detail = finding?.source.gateName || finding?.source.detectorName || finding?.signal?.type;
  return { status: response.status || "allow", detail, traceId: response.traceId || undefined };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}
