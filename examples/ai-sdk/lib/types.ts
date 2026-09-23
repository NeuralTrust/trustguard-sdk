import type { InferUITools, UIMessage } from "ai";

import type { tools } from "./tools";

/** One TrustGuard evaluation, streamed to the browser for the side panel. */
export type Verdict = {
  phase: "input" | "output" | "tool-call" | "tool-result";
  /** allow, report, transform, ask, block, or error when TrustGuard could not be reached. */
  status: string;
  /** The gate or detector that decided, when the verdict names one. */
  detail?: string;
  traceId?: string;
};

export type ChatMessage = UIMessage<never, { verdict: Verdict }, InferUITools<typeof tools>>;
