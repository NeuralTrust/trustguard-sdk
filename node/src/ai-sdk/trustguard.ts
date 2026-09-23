import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Middleware,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import type { ToolApprovalStatus, ToolSet } from "ai";

import type { TrustGuard } from "../client.js";
import type { GuardRequest, GuardResponse } from "../types.js";

/** Where in the agent loop an evaluation ran. */
export type GuardPhase = "input" | "output" | "tool-call" | "tool-result";

/** Options for {@link trustguard}. Create one instance per request so every evaluation carries the right user. */
export interface TrustGuardAISDKOptions {
  /** The end user the request runs for. Findings are grouped under it and gates match it as `consumer.id`. */
  consumerId?: string;
  /** The conversation key. Without it TrustGuard synthesises one per evaluation and turns lose their grouping. */
  sessionId?: string;
  /** Extra attributes merged into every evaluation, for gates and rule conditions. */
  attributes?: Record<string, unknown>;
  /**
   * How streamed responses are guarded.
   * - `"monitor"` (default): text streams untouched and is evaluated when the response finishes. Findings are recorded, nothing is enforced.
   * - `"buffer"`: each text block is held until it ends, evaluated, then released, redacted or replaced. Enforces the policy at the cost of streaming.
   */
  stream?: "monitor" | "buffer";
  /** What an `ask` verdict on the prompt does. The model call has no one to ask, so the default is `"block"`. */
  promptAsk?: "block" | "allow";
  /** What an `ask` verdict on a tool call does. The default, `"user-approval"`, asks the user through the AI SDK approval flow. */
  toolAsk?: "user-approval" | "deny";
  /** Text that replaces a response the policy blocked. */
  blockedMessage?: string;
  /**
   * What happens when TrustGuard cannot be reached or returns an error.
   * `"closed"` (default) throws on the prompt and the response and denies the tool call. `"open"` lets the traffic through.
   * Monitor-mode stream evaluations never fail the stream.
   */
  failMode?: "closed" | "open";
  /** Called with every verdict, for logging. */
  onVerdict?: (event: { phase: GuardPhase; response: GuardResponse }) => void;
  /** Called with every evaluation error, including the ones `failMode: "open"` swallows. */
  onError?: (event: { phase: GuardPhase; error: unknown }) => void;
}

/** Thrown when the policy blocks the prompt or the response, and by guarded tools whose result was withheld. */
export class TrustGuardBlockedError extends Error {
  readonly phase: GuardPhase;
  readonly response: GuardResponse;

  constructor(phase: GuardPhase, response: GuardResponse, message: string) {
    super(message);
    this.name = "TrustGuardBlockedError";
    this.phase = phase;
    this.response = response;
  }
}

/** The tool call the approval function receives. Structural, so it matches static and dynamic tool calls alike. */
export interface ApprovalToolCall {
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface TrustGuardAISDK {
  /** Language model middleware for `wrapLanguageModel`: guards the prompt and the response. */
  middleware: LanguageModelV4Middleware;
  /** A `toolApproval` function for `generateText` / `streamText`: guards each tool call before it runs. */
  toolApproval: (options: { toolCall: ApprovalToolCall }) => Promise<ToolApprovalStatus>;
  /** Wraps a tool set so every result is evaluated before the model reads it. */
  tools: <TOOLS extends ToolSet>(tools: TOOLS) => TOOLS;
}

const SOURCE_APPLICATION = "vercel-ai-sdk";
const DEFAULT_BLOCKED_MESSAGE = "This response was blocked by policy.";

/**
 * Connects a TrustGuard client to the Vercel AI SDK.
 *
 * ```ts
 * const tg = trustguard(client, { consumerId: user.id, sessionId: chatId });
 * streamText({
 *   model: wrapLanguageModel({ model, middleware: tg.middleware }),
 *   tools: tg.tools(tools),
 *   toolApproval: tg.toolApproval,
 *   messages,
 * });
 * ```
 */
export function trustguard(client: TrustGuard, options: TrustGuardAISDKOptions = {}): TrustGuardAISDK {
  const guard = new Guard(client, options);
  return {
    middleware: guard.middleware(),
    toolApproval: (approval) => guard.approveToolCall(approval.toolCall),
    tools: (tools) => guard.wrapTools(tools),
  };
}

class Guard {
  readonly #client: TrustGuard;
  readonly #options: TrustGuardAISDKOptions;

  constructor(client: TrustGuard, options: TrustGuardAISDKOptions) {
    this.#client = client;
    this.#options = options;
  }

  middleware(): LanguageModelV4Middleware {
    return {
      specificationVersion: "v4",
      transformParams: async ({ params, model }) => this.#guardPrompt(params, model),
      wrapGenerate: async ({ doGenerate, model }) => {
        const result = await doGenerate();
        return { ...result, content: await this.#guardContent(result.content, model) };
      },
      wrapStream: async ({ doStream, model }) => {
        const result = await doStream();
        const transform =
          this.#options.stream === "buffer" ? this.#bufferStream(model) : this.#monitorStream(model);
        return { ...result, stream: result.stream.pipeThrough(transform) };
      },
    };
  }

  async approveToolCall(call: ApprovalToolCall): Promise<ToolApprovalStatus> {
    let response: GuardResponse | undefined;
    try {
      response = await this.#evaluate("tool-call", {
        payload: toolsCall(call.toolName, call.input),
        direction: "input",
        protocol: "mcp",
        attributes: { tool: { name: call.toolName } },
      });
    } catch (error) {
      if (this.#failOpen("tool-call", error)) return undefined;
      return { type: "denied", reason: "TrustGuard could not evaluate this tool call." };
    }

    switch (response.status) {
      case "block":
        return { type: "denied", reason: reasonFor(response, "Blocked by TrustGuard") };
      case "ask":
        return this.#options.toolAsk === "deny"
          ? { type: "denied", reason: reasonFor(response, "TrustGuard requires approval") }
          : { type: "user-approval", reason: reasonFor(response, "TrustGuard requires approval") };
      case "transform":
        // Approval cannot rewrite the arguments, and running the call unredacted would leak what the policy masks.
        return {
          type: "denied",
          reason: reasonFor(response, "Blocked by TrustGuard because the arguments contain data the policy masks"),
        };
      default:
        return undefined;
    }
  }

  wrapTools<TOOLS extends ToolSet>(tools: TOOLS): TOOLS {
    const wrapped: Record<string, unknown> = {};
    for (const [name, tool] of Object.entries(tools)) {
      const execute = tool.execute as ((input: unknown, options: unknown) => unknown) | undefined;
      if (typeof execute !== "function") {
        wrapped[name] = tool;
        continue;
      }
      wrapped[name] = {
        ...tool,
        execute: (input: unknown, executeOptions: unknown) => {
          const output = execute.call(tool, input, executeOptions);
          return isAsyncIterable(output)
            ? this.#guardIterableResult(name, output)
            : Promise.resolve(output).then((value) => this.#guardResult(name, value));
        },
      };
    }
    return wrapped as TOOLS;
  }

  async #guardPrompt(params: LanguageModelV4CallOptions, model: LanguageModelV4): Promise<LanguageModelV4CallOptions> {
    const index = lastUserTurn(params.prompt);
    if (index < 0) return params;
    const message = params.prompt[index] as Extract<LanguageModelV4Prompt[number], { role: "user" }>;
    const text = joinText(message.content);
    if (!text.trim()) return params;

    let response: GuardResponse;
    try {
      response = await this.#evaluate("input", {
        payload: { input: text },
        direction: "input",
        protocol: "llm",
        attributes: modelAttributes(model),
      });
    } catch (error) {
      if (this.#failOpen("input", error)) return params;
      throw error;
    }

    const status = response.status === "ask" && this.#options.promptAsk !== "allow" ? "block" : response.status;
    if (status === "block") {
      throw new TrustGuardBlockedError("input", response, reasonFor(response, "Prompt blocked by TrustGuard"));
    }
    if (status !== "transform") return params;

    const masked = transformedText(response);
    if (masked === undefined) {
      throw new TrustGuardBlockedError(
        "input",
        response,
        "Prompt blocked by TrustGuard: the policy masked it but returned no masked text",
      );
    }
    const prompt = [...params.prompt];
    prompt[index] = { ...message, content: replaceText(message.content, masked) };
    return { ...params, prompt };
  }

  async #guardContent(content: LanguageModelV4Content[], model: LanguageModelV4): Promise<LanguageModelV4Content[]> {
    const text = joinText(content);
    if (!text.trim()) return content;

    const replacement = await this.#outputReplacement(text, model);
    return replacement === undefined ? content : replaceText(content, replacement);
  }

  /** The text that must replace a response, or undefined when it can go out as is. Throws when failing closed. */
  async #outputReplacement(text: string, model: LanguageModelV4): Promise<string | undefined> {
    let response: GuardResponse;
    try {
      response = await this.#evaluate("output", {
        payload: { input: text },
        direction: "output",
        protocol: "llm",
        attributes: modelAttributes(model),
      });
    } catch (error) {
      if (this.#failOpen("output", error)) return undefined;
      throw error;
    }
    if (response.status === "block") return this.#blockedMessage();
    if (response.status === "transform") return transformedText(response) ?? this.#blockedMessage();
    return undefined;
  }

  #monitorStream(model: LanguageModelV4): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> {
    let text = "";
    const evaluate = async () => {
      if (!text.trim()) return;
      try {
        await this.#evaluate("output", {
          payload: { input: text },
          direction: "output",
          protocol: "llm",
          attributes: modelAttributes(model),
        });
      } catch (error) {
        this.#options.onError?.({ phase: "output", error });
      }
    };
    return new TransformStream({
      transform(part, controller) {
        if (part.type === "text-delta") text += part.delta;
        controller.enqueue(part);
      },
      // The stream does not close until this resolves, so a serverless function stays alive until the evaluation is sent.
      async flush() {
        await evaluate();
      },
    });
  }

  #bufferStream(model: LanguageModelV4): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> {
    const open = new Map<string, LanguageModelV4StreamPart[]>();
    const release = async (
      id: string,
      end: LanguageModelV4StreamPart | undefined,
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
    ) => {
      const parts = open.get(id) ?? [];
      open.delete(id);
      const text = parts.map((p) => (p.type === "text-delta" ? p.delta : "")).join("");
      const replacement = text.trim() ? await this.#outputReplacement(text, model) : undefined;
      if (replacement === undefined) {
        for (const p of parts) controller.enqueue(p);
      } else {
        for (const p of parts) if (p.type !== "text-delta") controller.enqueue(p);
        controller.enqueue({ type: "text-delta", id, delta: replacement });
      }
      if (end) controller.enqueue(end);
    };
    return new TransformStream({
      async transform(part, controller) {
        switch (part.type) {
          case "text-start":
            open.set(part.id, [part]);
            return;
          case "text-delta": {
            const parts = open.get(part.id);
            if (parts) parts.push(part);
            else controller.enqueue(part);
            return;
          }
          case "text-end":
            if (open.has(part.id)) await release(part.id, part, controller);
            else controller.enqueue(part);
            return;
          default:
            controller.enqueue(part);
        }
      },
      async flush(controller) {
        // A stream that ends without text-end still goes through the policy before anything is released.
        for (const id of [...open.keys()]) await release(id, undefined, controller);
      },
    });
  }

  async #guardResult(toolName: string, output: unknown): Promise<unknown> {
    const text = typeof output === "string" ? output : JSON.stringify(output);
    if (text === undefined || !text.trim()) return output;

    let response: GuardResponse;
    try {
      response = await this.#evaluate("tool-result", {
        payload: { input: text },
        direction: "output",
        protocol: "mcp",
        attributes: { tool: { name: toolName } },
      });
    } catch (error) {
      if (this.#failOpen("tool-result", error)) return output;
      throw error;
    }

    if (response.status === "block") {
      throw new TrustGuardBlockedError(
        "tool-result",
        response,
        reasonFor(response, `TrustGuard withheld the result of ${toolName}`),
      );
    }
    if (response.status !== "transform") return output;

    const masked = transformedText(response);
    if (masked === undefined) {
      throw new TrustGuardBlockedError(
        "tool-result",
        response,
        `TrustGuard withheld the result of ${toolName}: the policy masked it but returned no masked text`,
      );
    }
    if (typeof output === "string") return masked;
    try {
      return JSON.parse(masked) as unknown;
    } catch {
      return masked;
    }
  }

  async *#guardIterableResult(toolName: string, output: AsyncIterable<unknown>): AsyncGenerator<unknown> {
    // Preliminary outputs reach the UI only. The last one is what the model reads, so that is the one guarded:
    // when the policy changes it, the guarded value is yielded after it and becomes the final output.
    let last: unknown;
    let seen = false;
    for await (const value of output) {
      last = value;
      seen = true;
      yield value;
    }
    if (!seen) return;
    const guarded = await this.#guardResult(toolName, last);
    if (guarded !== last) yield guarded;
  }

  async #evaluate(phase: GuardPhase, request: GuardRequest): Promise<GuardResponse> {
    const response = await this.#client.guard({
      ...request,
      sessionId: this.#options.sessionId,
      consumerId: this.#options.consumerId,
      attributes: {
        ...this.#options.attributes,
        ...request.attributes,
        source: { application: SOURCE_APPLICATION },
      },
    });
    this.#options.onVerdict?.({ phase, response });
    return response;
  }

  #failOpen(phase: GuardPhase, error: unknown): boolean {
    this.#options.onError?.({ phase, error });
    return this.#options.failMode === "open";
  }

  #blockedMessage(): string {
    return this.#options.blockedMessage ?? DEFAULT_BLOCKED_MESSAGE;
  }
}

/** Index of the user message that starts this model call, or -1 when the call continues a tool loop. */
function lastUserTurn(prompt: LanguageModelV4Prompt): number {
  const last = prompt.length - 1;
  return last >= 0 && prompt[last]?.role === "user" ? last : -1;
}

type TextLike = { type: string; text?: string };

function joinText(parts: readonly TextLike[]): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Puts `text` in place of the first text part and drops the others, keeping every non-text part where it was. */
function replaceText<T extends TextLike>(parts: readonly T[], text: string): T[] {
  let placed = false;
  const out: T[] = [];
  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
    } else if (!placed) {
      out.push({ ...part, text });
      placed = true;
    }
  }
  return out;
}

function transformedText(response: GuardResponse): string | undefined {
  const input = response.transformedPayload?.input;
  return typeof input === "string" ? input : undefined;
}

function toolsCall(name: string, input: unknown): Record<string, unknown> {
  const args = input !== null && typeof input === "object" && !Array.isArray(input) ? input : { input };
  return { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
}

function modelAttributes(model: LanguageModelV4): Record<string, unknown> {
  return { model: { name: model.modelId, provider: model.provider } };
}

/** `reason`, followed by the gate or detector that produced the verdict when the response names one. */
function reasonFor(response: GuardResponse, reason: string): string {
  const finding =
    response.findings.find((f) => f.outcome?.action === response.status) ?? response.findings.find((f) => f.outcome);
  const name = finding?.source.gateName || finding?.source.detectorName || finding?.signal?.type;
  return name ? `${reason}: ${name}` : reason;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value !== null && typeof value === "object" && Symbol.asyncIterator in value;
}

