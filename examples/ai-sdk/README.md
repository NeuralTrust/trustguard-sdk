# TrustGuard × Vercel AI SDK

A Next.js chat agent guarded by `@neuraltrust/trustguard-sdk/ai-sdk`. Every prompt, answer, tool call and tool result goes through your TrustGuard policy, and a side panel shows each verdict as it happens.

| File | What it shows |
|---|---|
| [`app/api/chat/route.ts`](app/api/chat/route.ts) | The route: the model wrapped with the middleware, the tools wrapped with `tg.tools()`, `tg.toolApproval`, signed approvals, and the verdicts streamed to the browser |
| [`app/page.tsx`](app/page.tsx) | `useChat`, the approval buttons for an Ask gate, and the verdict panel |
| [`lib/tools.ts`](lib/tools.ts) | Three offline tools: one harmless, one that returns content the model should not trust, and one with a side effect |

## Run it

The example uses the SDK from this repository, so build it first:

```bash
cd examples/ai-sdk
npm install
npm run sdk          # installs and builds ../../node
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

Fill in `.env.local`:

| Variable | Value |
|---|---|
| `TRUSTGUARD_BASE_URL` | The public base URL from the collector's **Connection** tab |
| `TRUSTGUARD_API_KEY` | The `tgk_…` key of an **Application → Node.js** collector |
| `OPENAI_API_KEY` | Any OpenAI key. Swap the provider in the route for another model. |
| `TOOL_APPROVAL_SECRET` | Any random string, e.g. `openssl rand -base64 32` |
| `TRUSTGUARD_STREAM` | `monitor` (default) or `buffer`. See [Streaming](#streaming). |

## Set up the policy

Assign a policy to the collector with these rules, in **Enforce** mode, to see every path. In **Observe** mode, everything is allowed and the panel shows what would have happened.

| Suggestion in the chat | Rule | What you see |
|---|---|---|
| **Allowed** | None | Four `allow` verdicts: the prompt, the tool call, the tool result, the answer |
| **Prompt blocked** | Input: Prompt Guard, Block | The model is not called. The chat shows `Prompt blocked by TrustGuard`. |
| **Tool result withheld** | Output: indirect prompt injection, Block, for protocol MCP | `readPage` fails and the model never reads the planted instruction |
| **Tool result masked** | Output: DLP for emails and phone numbers, Transform, for protocol MCP | `readPage` returns the page with the contacts masked |
| **Approval requested** | Input gate: tool name is `sendEmail`, Ask | The call waits for **Allow** or **Deny** in the chat |

Every evaluation also lands in **Activity**, under the consumer `demo-user` and one session per chat.

## What to notice

- **Blocks are visible.** The AI SDK hides error messages from the browser. The route passes a `TrustGuardBlockedError` message through, and only that one.
- **Approvals are signed.** The answer to an approval comes back in the message history the browser sends. `experimental_toolApprovalSecret` makes the AI SDK sign each request, so a client cannot approve a call the server never asked about or change its arguments. When the answer arrives, the AI SDK calls `toolApproval` again, so a call the policy now blocks stays denied even after the user allowed it. That is the second `tool-call` verdict in the panel.
- **The verdict panel is optional.** It is `onVerdict` writing a transient data part into the UI stream. Remove it and the guard works the same.
- **The user is hard-coded.** Replace `demo-user` in the route with the signed-in user, so findings are grouped per person.

## Streaming

With `TRUSTGUARD_STREAM=monitor`, the answer streams as it is generated and is evaluated when it ends. Findings reach **Activity**, but a block cannot take back what the user already saw. With `buffer`, each text block is held until TrustGuard has evaluated it, then released, masked or replaced. Prompts, tool calls and tool results are enforced in both modes.

## Deploy to Vercel

The `file:` dependency on `../../node` only works inside this repository. In your own project, install the published package instead and drop `next.config.ts`:

```bash
npm install @neuraltrust/trustguard-sdk ai @ai-sdk/react @ai-sdk/openai zod
```

Then set the variables above in the project's **Environment Variables**. The route runs on the Node.js runtime and needs no other configuration.
