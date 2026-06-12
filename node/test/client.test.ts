import { describe, expect, it, vi } from "vitest";

import { TrustGuard, TrustGuardAPIError } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const okBody = {
  is_flagged: false,
  transformed_payload: null,
  findings: [],
  trace_id: "t-1",
  request_id: "r-1",
};

function clientWith(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  const client = new TrustGuard({
    baseUrl: "https://guard.example.com",
    apiKey: "secret-key",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("constructor", () => {
  it("requires baseUrl", () => {
    expect(() => new TrustGuard({ baseUrl: "  ", apiKey: "k" })).toThrow(/baseUrl/);
  });

  it("requires apiKey", () => {
    expect(() => new TrustGuard({ baseUrl: "https://guard.example.com", apiKey: "" })).toThrow(/apiKey/);
  });
});

describe("guard", () => {
  it("sends the expected request", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({
      input: { prompt: "hello" },
      direction: "output",
      sessionId: "s-1",
      consumerId: "u-1",
      metadata: { policy_id: "11111111-1111-1111-1111-111111111111" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://guard.example.com/v1/guard");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      input: { prompt: "hello" },
      direction: "output",
      session_id: "s-1",
      consumer_id: "u-1",
      metadata: { policy_id: "11111111-1111-1111-1111-111111111111" },
    });
  });

  it("trims trailing slashes from the base url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, okBody));
    const client = new TrustGuard({
      baseUrl: "https://guard.example.com//",
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.guard({ input: { prompt: "hi" } });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://guard.example.com/v1/guard");
  });

  it("omits empty optional fields (server rejects unknown/extra top-level keys)", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({ input: { prompt: "hi" } });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(Object.keys(body)).toEqual(["input"]);
  });

  it("folds attachments into metadata.attachments as base64", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({
      input: { prompt: "hi" },
      attachments: [
        { filename: "doc.txt", contentType: "text/plain", data: "hello" },
        { filename: "img.png", contentType: "image/png", data: new Uint8Array([0x89, 0x50]) },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.metadata.attachments).toEqual([
      { filename: "doc.txt", content_type: "text/plain", data: "aGVsbG8=" },
      { filename: "img.png", content_type: "image/png", data: "iVA=" },
    ]);
  });

  it("deserializes a flagged response", async () => {
    const { client } = clientWith(
      jsonResponse(200, {
        is_flagged: true,
        transformed_payload: { prompt: "[MASKED]" },
        findings: [
          { detection_type: "jailbreak", confidence: 0.97, rule_name: "jb-1", details: { plugin: "jailbreak" } },
        ],
        trace_id: "t-2",
        request_id: "r-2",
      }),
    );

    const res = await client.guard({ input: { prompt: "hi" } });

    expect(res).toEqual({
      isFlagged: true,
      transformedPayload: { prompt: "[MASKED]" },
      findings: [{ detectionType: "jailbreak", confidence: 0.97, ruleName: "jb-1", details: { plugin: "jailbreak" } }],
      traceId: "t-2",
      requestId: "r-2",
    });
  });

  it("throws TrustGuardAPIError on non-2xx with the API error body", async () => {
    const { client } = clientWith(
      jsonResponse(403, { error: "policy not allowed for this api key", trace_id: "t-3", request_id: "r-3" }),
    );

    const err = await client.guard({ input: { prompt: "hi" } }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TrustGuardAPIError);
    const apiErr = err as TrustGuardAPIError;
    expect(apiErr.status).toBe(403);
    expect(apiErr.traceId).toBe("t-3");
    expect(apiErr.requestId).toBe("r-3");
    expect(apiErr.message).toContain("policy not allowed for this api key");
  });

  it("tolerates non-JSON error bodies", async () => {
    const { client } = clientWith(new Response("bad gateway", { status: 502 }));

    const err = await client.guard({ input: { prompt: "hi" } }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TrustGuardAPIError);
    expect((err as TrustGuardAPIError).status).toBe(502);
    expect((err as TrustGuardAPIError).message).toContain("bad gateway");
  });

  it("rejects a request without input", async () => {
    const { client } = clientWith(jsonResponse(200, okBody));

    await expect(client.guard({} as never)).rejects.toThrow(/input is required/);
  });
});
