import { describe, expect, it, vi } from "vitest";

import { TrustGuard, TrustGuardAPIError } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const okBody = {
  status: "",
  transformed_payload: null,
  findings: [],
  trace_id: "t-1",
  request_id: "r-1",
};

function clientWith(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  const client = new TrustGuard({
    baseUrl: "https://guard.neuraltrust.ai",
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
    expect(() => new TrustGuard({ baseUrl: "https://guard.neuraltrust.ai", apiKey: "" })).toThrow(/apiKey/);
  });
});

describe("guard", () => {
  it("sends the expected request", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({
      payload: { input: "hello" },
      direction: "output",
      protocol: "llm",
      collectorKey: "ck-1",
      sessionId: "s-1",
      consumerId: "u-1",
      attributes: { content_type: "text/plain" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://guard.neuraltrust.ai/v1/guard");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      payload: { input: "hello" },
      direction: "output",
      protocol: "llm",
      collector_key: "ck-1",
      session_id: "s-1",
      consumer_id: "u-1",
      attributes: { content_type: "text/plain" },
    });
  });

  it("trims trailing slashes from the base url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, okBody));
    const client = new TrustGuard({
      baseUrl: "https://guard.neuraltrust.ai//",
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.guard({ payload: { input: "hi" } });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://guard.neuraltrust.ai/v1/guard");
  });

  it("omits empty optional fields (server rejects unknown/extra top-level keys)", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({ payload: { input: "hi" } });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(Object.keys(body)).toEqual(["payload"]);
  });

  it("folds attachments into payload.attachments as base64", async () => {
    const { client, fetchMock } = clientWith(jsonResponse(200, okBody));

    await client.guard({
      payload: { input: "hi" },
      attachments: [
        { filename: "doc.txt", contentType: "text/plain", data: "hello" },
        { filename: "img.png", contentType: "image/png", data: new Uint8Array([0x89, 0x50]) },
        { filename: "report.txt", contentType: "text/plain", url: "https://example.com/r.txt" },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.payload.attachments).toEqual([
      { filename: "doc.txt", content_type: "text/plain", data: "aGVsbG8=" },
      { filename: "img.png", content_type: "image/png", data: "iVA=" },
      { filename: "report.txt", content_type: "text/plain", url: "https://example.com/r.txt" },
    ]);
  });

  it("deserializes a blocked response", async () => {
    const { client } = clientWith(
      jsonResponse(200, {
        status: "block",
        transformed_payload: { prompt: "[MASKED]" },
        findings: [
          {
            detection_type: "jailbreak",
            confidence: 0.97,
            rule_name: "jb-1",
            status: "block",
            policy_id: "p-1",
            detector_id: "d-1",
            action: "block",
            details: { plugin: "jailbreak" },
          },
        ],
        trace_id: "t-2",
        request_id: "r-2",
      }),
    );

    const res = await client.guard({ payload: { input: "hi" } });

    expect(res).toEqual({
      status: "block",
      isBlocked: true,
      transformedPayload: { prompt: "[MASKED]" },
      findings: [
        {
          detectionType: "jailbreak",
          confidence: 0.97,
          ruleName: "jb-1",
          status: "block",
          policyId: "p-1",
          detectorId: "d-1",
          action: "block",
          details: { plugin: "jailbreak" },
        },
      ],
      traceId: "t-2",
      requestId: "r-2",
    });
  });

  it("throws TrustGuardAPIError on non-2xx with the API error body", async () => {
    const { client } = clientWith(
      jsonResponse(403, { error: "policy not allowed for this api key", trace_id: "t-3", request_id: "r-3" }),
    );

    const err = await client.guard({ payload: { input: "hi" } }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TrustGuardAPIError);
    const apiErr = err as TrustGuardAPIError;
    expect(apiErr.status).toBe(403);
    expect(apiErr.traceId).toBe("t-3");
    expect(apiErr.requestId).toBe("r-3");
    expect(apiErr.message).toContain("policy not allowed for this api key");
  });

  it("tolerates non-JSON error bodies", async () => {
    const { client } = clientWith(new Response("bad gateway", { status: 502 }));

    const err = await client.guard({ payload: { input: "hi" } }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TrustGuardAPIError);
    expect((err as TrustGuardAPIError).status).toBe(502);
    expect((err as TrustGuardAPIError).message).toContain("bad gateway");
  });

  it("rejects a request without payload", async () => {
    const { client } = clientWith(jsonResponse(200, okBody));

    await expect(client.guard({} as never)).rejects.toThrow(/payload is required/);
  });
});
