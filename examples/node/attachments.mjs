// Attachment scanning: send a document alongside the prompt so file-aware
// plugins in the policy can evaluate it.
//
//   export TRUSTGUARD_BASE_URL="https://guard.neuraltrust.ai"
//   export TRUSTGUARD_API_KEY="your-collector-api-key"
//   node attachments.mjs [path/to/file]

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { TrustGuard } from "@neuraltrust/trustguard-sdk";

const client = new TrustGuard({
  baseUrl: process.env.TRUSTGUARD_BASE_URL,
  apiKey: process.env.TRUSTGUARD_API_KEY,
});

const path = process.argv[2] ?? new URL("./basic.mjs", import.meta.url).pathname;
const data = await readFile(path);

const response = await client.guard({
  input: { prompt: "Summarize the attached document." },
  attachments: [
    {
      filename: basename(path),
      contentType: "application/octet-stream",
      data, // raw bytes; the SDK base64-encodes them on the wire
    },
  ],
});

console.log(response.isFlagged ? "BLOCKED" : "allowed", `(${response.findings.length} findings)`);
