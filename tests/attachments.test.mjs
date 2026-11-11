import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const testRoot = join(root, "_isolated_test");
await mkdir(testRoot, { recursive: true });
const buildDir = await mkdtemp(join(testRoot, "attachments-"));
const entry = join(buildDir, "entry.mjs");
await build({
  stdin: {
    contents: [
      'export * from "./src/freshservice-client.js";',
      'export * from "./src/tools/attachments.js";',
      'export * from "./src/tools/tickets.js";',
      'export * from "./src/tools/tickets-readonly.js";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
  },
  outfile: entry,
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node18",
  format: "esm",
});
const api = await import(pathToFileURL(entry).href);
after(() => rm(buildDir, { recursive: true, force: true }));
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const config = { domain: "example.freshservice.com", apiKey: "test-key" };
const origin = `https://${config.domain}`;
const auth = `Basic ${Buffer.from("test-key:X").toString("base64")}`;
const attachment = {
  id: 42, name: "log.txt", content_type: "text/plain", size: 3,
  attachment_url: "https://cdn.freshservice.com/log.txt",
};
const ticket = { id: 7, subject: "Example", status: 2, priority: 1, attachments: [attachment] };
const conversation = { id: 8, private: true, attachments: [{ ...attachment, id: 43 }] };
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

function responses(...queue) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.ok(queue.length, "unexpected HTTP request");
    return queue.shift();
  };
  return calls;
}

async function connect(t, readonly = false) {
  const server = new McpServer({ name: "attachment-test", version: "1.0.0" });
  (readonly ? api.registerReadOnlyTicketTools : api.registerTicketTools)(server, config);
  api.registerAttachmentTools(server, config);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

for (const readonly of [false, true]) {
  const mode = readonly ? "read-only" : "normal";
  test(`${mode}: ticket and comment tools preserve attachment metadata`, async (t) => {
    const client = await connect(t, readonly);
    const calls = responses(json({ ticket }), json({ conversations: [conversation] }));
    const details = await client.callTool({ name: "get_ticket", arguments: { ticket_id: 7 } });
    assert.deepEqual(JSON.parse(details.content[0].text).attachments, [attachment]);
    assert.equal(calls[0].url.searchParams.get("include"), "requester,stats,ticket_attachments");
    const comments = await client.callTool({ name: "get_ticket_comments", arguments: { ticket_id: 7 } });
    assert.deepEqual(JSON.parse(comments.content[0].text).conversations[0].attachments, conversation.attachments);
  });

  test(`${mode}: list includes ticket files and files after 100 conversations`, async (t) => {
    const client = await connect(t, readonly);
    const firstPage = Array.from({ length: 100 }, (_, id) => ({ id, private: false }));
    const calls = responses(json({ ticket }), json({ conversations: firstPage }), json({ conversations: [conversation] }));
    const result = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), {
      ticket_id: 7, count: 2, attachments: [
        { ...attachment, source: "ticket", conversation_id: null, private: null },
        { ...conversation.attachments[0], source: "conversation", conversation_id: 8, private: true },
      ],
    });
    assert.equal(calls[0].url.searchParams.get("include"), "ticket_attachments");
    assert.equal(calls[1].url.searchParams.get("per_page"), "100");
    assert.equal(calls[2].url.searchParams.get("page"), "2");
  });

  test(`${mode}: empty lists and omitted attachment arrays are supported`, async (t) => {
    const client = await connect(t, readonly);
    responses(json({ ticket: { ...ticket, attachments: undefined } }), json({ conversations: [{ id: 8 }] }));
    const result = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
    assert.deepEqual(JSON.parse(result.content[0].text), { ticket_id: 7, count: 0, attachments: [] });
  });
}

test("download returns exact bytes and authenticates the fixed API endpoint", async () => {
  const bytes = Buffer.from([0, 255, 128, 1]);
  const calls = responses(new Response(bytes, { headers: { "Content-Type": "application/pdf" } }));
  const result = await api.downloadAttachment(config, 42);
  assert.deepEqual(result.data, bytes);
  assert.equal(result.contentType, "application/pdf");
  assert.equal(calls[0].url.href, `${origin}/api/v2/attachments/42`);
  assert.equal(calls[0].options.headers.Authorization, auth);
  assert.equal(calls[0].options.redirect, "manual");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("CDN redirects never receive or reintroduce the API key", async () => {
  const calls = responses(
    new Response(null, { status: 302, headers: { Location: "/download/42" } }),
    new Response(null, { status: 307, headers: { Location: "https://cdn.freshservice.com/file?signature=secret" } }),
    new Response(null, { status: 302, headers: { Location: `${origin}/file` } }),
    new Response("ok")
  );
  assert.equal((await api.downloadAttachment(config, 42)).data.toString(), "ok");
  assert.deepEqual(calls.map((c) => c.options.headers.Authorization), [auth, auth, undefined, undefined]);
});

test("invalid IDs, insecure redirects and redirect loops are rejected", async () => {
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    const calls = responses();
    await assert.rejects(api.downloadAttachment(config, id), /positive safe integer/);
    assert.equal(calls.length, 0);
  }
  for (const location of ["http://cdn.freshservice.com/file", "https://user:pass@cdn.freshservice.com/file"]) {
    responses(new Response(null, { status: 302, headers: { Location: location } }));
    await assert.rejects(api.downloadAttachment(config, 42), /HTTPS without URL credentials/);
  }
  responses(new Response(null, { status: 302 }));
  await assert.rejects(api.downloadAttachment(config, 42), /missing redirect location/);
  const calls = responses(...Array.from({ length: 6 }, () => new Response(null, { status: 302, headers: { Location: "/loop" } })));
  await assert.rejects(api.downloadAttachment(config, 42), /too many redirects/);
  assert.equal(calls.length, 6);
});

test("download errors report status without leaking signed URLs", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    responses(new Response(null, { status: 302, headers: { Location: "https://cdn.freshservice.com/?token=secret" } }), new Response("secret", { status }));
    await assert.rejects(api.downloadAttachment(config, 42), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /secret|cdn/);
      return true;
    });
  }
});

test("size limit rejects declared and streamed oversized downloads", async () => {
  responses(new Response(null, { headers: { "Content-Length": String(api.MAX_ATTACHMENT_BYTES + 1) } }));
  await assert.rejects(api.downloadAttachment(config, 42), /10 MiB/);
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(api.MAX_ATTACHMENT_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { canceled = true; },
  });
  responses(new Response(body));
  await assert.rejects(api.downloadAttachment(config, 42), /10 MiB/);
  assert.equal(canceled, true);
});

test("MCP download delivers text, images and binary resources", async (t) => {
  const client = await connect(t, true);
  for (const [contentType, bytes, expected] of [
    ["text/plain; charset=utf-8", Buffer.from("Grüße"), { text: "Grüße" }],
    ["text/plain; charset=iso-8859-1", Buffer.from([0xe4]), { text: "ä" }],
    ["application/json", Buffer.from('{"ok":true}'), { text: '{"ok":true}' }],
    ["text/plain; charset=unknown", Buffer.from([0xff]), { blob: "/w==" }],
    ["text/plain", Buffer.from([0xff]), { blob: "/w==" }],
    ["application/pdf", Buffer.from([0, 255]), { blob: "AP8=" }],
    ["image/png", Buffer.from([0, 255]), { data: "AP8=" }],
  ]) {
    responses(new Response(bytes, { headers: { "Content-Type": contentType } }));
    const result = await client.callTool({ name: "download_attachment", arguments: { attachment_id: 42 } });
    assert.equal(result.isError, undefined);
    const mimeType = contentType.split(";")[0];
    assert.deepEqual(result.content[0], expected.data
      ? { type: "image", mimeType, ...expected }
      : { type: "resource", resource: { uri: `${origin}/api/v2/attachments/42`, mimeType, ...expected } });
  }
});

test("MCP rejects invalid inputs and surfaces Freshservice errors", async (t) => {
  const client = await connect(t);
  const calls = responses();
  const invalid = await client.callTool({ name: "download_attachment", arguments: { attachment_id: -1 } });
  assert.equal(invalid.isError, true);
  assert.equal(calls.length, 0);
  responses(new Response("no access", { status: 403 }));
  const denied = await client.callTool({ name: "download_attachment", arguments: { attachment_id: 42 } });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /HTTP 403/);
  const ticketCalls = responses(new Response("missing", { status: 404 }));
  const missing = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
  assert.equal(missing.isError, true);
  assert.equal(ticketCalls.length, 1);
});

for (const readonly of [false, true]) {
  test(`standalone bundle registers attachment tools (readonly=${readonly})`, async (t) => {
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "dist/index.js")],
      env: { FRESHSERVICE_DOMAIN: config.domain, FRESHSERVICE_API_KEY: config.apiKey, FRESHSERVICE_READONLY: String(readonly) },
      stderr: "pipe",
    });
    t.after(() => client.close());
    await client.connect(transport);
    const { tools } = await client.listTools();
    for (const name of ["list_ticket_attachments", "download_attachment"]) {
      assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
    }
    assert.equal(tools.some((tool) => tool.name === "create_ticket"), !readonly);
  });
}
