import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const testRoot = join(root, "_isolated_test");
await mkdir(testRoot, { recursive: true });
const buildDir = await mkdtemp(join(testRoot, "inline-images-"));
const entry = join(buildDir, "entry.mjs");
await build({
  stdin: {
    contents: [
      'export * from "./src/freshservice-client.js";',
      'export * from "./src/inline-images.js";',
      'export * from "./src/tools/attachments.js";',
      'export * from "./src/tools/tickets.js";',
      'export * from "./src/tools/tickets-readonly.js";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
  },
  outfile: entry, bundle: true, packages: "external", platform: "node", target: "node22", format: "esm",
});
const api = await import(pathToFileURL(entry).href);
after(() => rm(buildDir, { recursive: true, force: true }));
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const config = { domain: "yourcompany.freshservice.com", apiKey: "test-key" };
const origin = `https://${config.domain}`;
const auth = `Basic ${Buffer.from("test-key:X").toString("base64")}`;
const url = "https://assets.cloudfront.net/inline/example.png?token=example%2Bvalue&expires=123";
const imageHtml = `<IMG SRC='${url.replaceAll("&", "&amp;")}' ALT='Example &quot;image&quot; > details'>`;
const image = { image_index: 1, alt: 'Example "image" > details', url, downloadable: true };
const ticket = {
  id: 7, subject: "Example", status: 2, priority: 2, type: "Incident", attachments: [],
  description: `<p>Example description</p>${imageHtml}`, description_text: "Example description",
};
const conversation = { id: 8, private: true, body: `<p>Image details:</p>${imageHtml}`, body_text: "Image details:", attachments: [] };
const bytes = Buffer.from([0, 255, 128, 1]);
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const png = () => new Response(bytes, { headers: { "Content-Type": "image/png" } });

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
  const server = new McpServer({ name: "inline-image-test", version: "1.0.0" });
  (readonly ? api.registerReadOnlyTicketTools : api.registerTicketTools)(server, config);
  api.registerAttachmentTools(server, config);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

test("HTML image discovery decodes attributes, resolves URLs and ignores non-element lookalikes", () => {
  const html = `<!-- <img src='https://ignored.example.com/comment.png'> -->
    <script>const text = "<img src='https://ignored.example.com/script.png'>";</script>
    <template><img src='https://ignored.example.com/template.png'></template>
    &lt;img src='https://ignored.example.com/escaped.png'&gt;
    ${imageHtml}${imageHtml}
    <img src=/inline/example.png><img src='//cdn.freshservice.com/other.png'>
    <img><img src=''><img src='https://['><img src='javascript:alert(1)'><img src='file:///tmp/example.png'>`;
  assert.deepEqual(api.inlineImages(html, config), [
    image,
    { image_index: 2, url: `${origin}/inline/example.png`, downloadable: true },
    { image_index: 3, url: "https://cdn.freshservice.com/other.png", downloadable: true },
  ]);
  for (const html of [undefined, "", "<p>Text only</p>"]) assert.deepEqual(api.inlineImages(html, config), []);
});

test("HTML text fallback preserves paragraph/list formatting and literal escaped markup", () => {
  const html = "<p>One &amp; two<br>Three</p><ul><li>A</li><li>B</li></ul>" +
    "<p>&lt;img&gt; &#x1F600;</p><!-- hidden --><script>hidden</script>" +
    "<style>hidden</style><template><p>hidden</p></template>";
  assert.equal(api.stripHtml(html), "One & two\nThree\n• A\n• B\n<img> 😀");
});

test("unsupported image references remain discoverable while embedded data stays out of text output", () => {
  const embedded = `data:image/png;base64,${bytes.toString("base64")}`;
  const html = `<img src='${embedded}'><img src='cid:example'><img src='http://images.example.com/image.png'>
    <img src='https://images.example.com/image.png'><img src='blob:https://yourcompany.freshservice.com/example'>`;
  assert.deepEqual(api.inlineImages(html, config), [
    { image_index: 1, embedded: true, content_type: "image/png", downloadable: true },
    { image_index: 2, url: "cid:example", downloadable: false },
    { image_index: 3, url: "http://images.example.com/image.png", downloadable: false },
    { image_index: 4, url: "https://images.example.com/image.png", downloadable: false },
    { image_index: 5, url: "blob:https://yourcompany.freshservice.com/example", downloadable: false },
  ]);
  assert.equal(JSON.stringify(api.inlineImages(html, config)).includes(bytes.toString("base64")), false);
});

for (const readonly of [false, true]) {
  test(`ticket and comment reads preserve inline images even with plain text and empty attachment arrays (readonly=${readonly})`, async (t) => {
    const client = await connect(t, readonly);
    for (const plain of [undefined, "", "Image details:"]) {
      const calls = responses(json({ ticket: { ...ticket, description_text: plain === undefined ? undefined : "" } }), json({ conversations: [{ ...conversation, body_text: plain }] }));
      const details = await client.callTool({ name: "get_ticket", arguments: { ticket_id: 7 } });
      const read = JSON.parse(details.content[0].text);
      assert.equal(read.description, "Example description");
      assert.deepEqual(read.attachments, []);
      assert.deepEqual(read.inline_images, [image]);
      const comments = await client.callTool({ name: "get_ticket_comments", arguments: { ticket_id: 7 } });
      const comment = JSON.parse(comments.content[0].text).conversations[0];
      assert.equal(comment.body, "Image details:");
      assert.deepEqual(comment.attachments, []);
      assert.deepEqual(comment.inline_images, [image]);
      assert.equal(calls.length, 2, "discovery must not fetch image contents");
    }
    responses(json({ conversations: [{ ...conversation, body: imageHtml, body_text: "" }] }));
    const onlyImage = await client.callTool({ name: "get_ticket_comments", arguments: { ticket_id: 7 } });
    assert.equal(JSON.parse(onlyImage.content[0].text).conversations[0].body, "");
    assert.deepEqual(JSON.parse(onlyImage.content[0].text).conversations[0].inline_images, [image]);
  });

  test(`attachment listing includes description/comment images and keeps service-request files (readonly=${readonly})`, async (t) => {
    const client = await connect(t, readonly);
    const attachment = { id: 42, name: "example.txt", content_type: "text/plain", size: 3 };
    const calls = responses(
      json({ ticket: { ...ticket, type: "Service Request" } }),
      json({ conversations: [conversation] }),
      json({ requested_items: [{ id: 9, attachments: [attachment] }] })
    );
    const result = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
    assert.equal(result.isError, undefined);
    const listed = JSON.parse(result.content[0].text);
    assert.equal(listed.count, 3);
    const common = { image_index: 1, alt: image.alt, downloadable: true, name: image.alt, attachment_url: url, inline: true, ticket_id: 7 };
    assert.deepEqual(listed.attachments[0], { ...common, source: "ticket", conversation_id: null, private: null });
    assert.deepEqual(listed.attachments[1], { ...common, source: "conversation", conversation_id: 8, private: true });
    assert.equal(listed.attachments[2].source, "requested_item");
    assert.equal(calls.length, 3);
  });

  test(`inline download re-reads the chosen source and delivers an MCP image (readonly=${readonly})`, async (t) => {
    const client = await connect(t, readonly);
    const { tools } = await client.listTools();
    const tool = tools.find((tool) => tool.name === "download_inline_image");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.properties.url, undefined);
    for (const conversation_id of [undefined, 8]) {
      const calls = responses(conversation_id === undefined ? json({ ticket }) : json({ conversations: [conversation] }), png());
      const result = await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, image_index: 1, ...(conversation_id ? { conversation_id } : {}) } });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.content, [{ type: "image", mimeType: "image/png", data: bytes.toString("base64") }]);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url.pathname, conversation_id === undefined ? "/api/v2/tickets/7" : "/api/v2/tickets/7/conversations");
      assert.equal(calls[0].options.headers.Authorization, auth);
      assert.equal(calls[1].url.href, url);
      assert.equal(calls[1].options.headers.Authorization, undefined);
      assert.equal(calls[1].options.redirect, "manual");
      assert.ok(calls[1].options.signal instanceof AbortSignal);
    }
  });
}

test("inline listing deduplicates repeated HTML sources and ordinary attachments in the same context", async (t) => {
  const client = await connect(t);
  const attachment = { id: 42, name: "example.png", content_type: "image/png", size: 4, attachment_url: url };
  responses(json({ ticket: { ...ticket, description: imageHtml.repeat(2), attachments: [attachment] } }), json({ conversations: [] }));
  const result = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
  assert.deepEqual(JSON.parse(result.content[0].text), {
    ticket_id: 7, count: 1, attachments: [{ ...attachment, source: "ticket", conversation_id: null, private: null }],
  });
});

test("comment inline discovery and downloads follow all conversation pages", async (t) => {
  const client = await connect(t);
  const first = Array.from({ length: 100 }, (_, id) => ({ id: 100 + id, private: false, body: "<p>Text</p>" }));
  const calls = responses(json({ ticket: { ...ticket, description: "" } }), json({ conversations: first }), json({ conversations: [conversation] }));
  const result = await client.callTool({ name: "list_ticket_attachments", arguments: { ticket_id: 7 } });
  assert.equal(JSON.parse(result.content[0].text).count, 1);
  assert.equal(calls[2].url.searchParams.get("page"), "2");
  const downloadCalls = responses(json({ conversations: first }), json({ conversations: [conversation] }), png());
  const download = await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, conversation_id: 8, image_index: 1 } });
  assert.equal(download.isError, undefined);
  assert.equal(downloadCalls.length, 3);
});

test("embedded image data can be retrieved without an external download", async (t) => {
  const client = await connect(t);
  const calls = responses(json({ ticket: { ...ticket, description: `<img src='data:image/png;base64,${bytes.toString("base64")}'>` } }));
  const result = await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, image_index: 1 } });
  assert.deepEqual(result.content, [{ type: "image", mimeType: "image/png", data: bytes.toString("base64") }]);
  assert.equal(calls.length, 1);
});

test("API authorization is only used for the configured origin and is never reintroduced after a CDN redirect", async () => {
  const calls = responses(
    new Response(null, { status: 302, headers: { Location: url } }),
    new Response(null, { status: 302, headers: { Location: `${origin}/inline/example.png` } }),
    png()
  );
  assert.deepEqual((await api.downloadInlineImage(config, `${origin}/inline/example.png`)).data, bytes);
  assert.deepEqual(calls.map((call) => call.options.headers.Authorization), [auth, undefined, undefined]);
});

test("unsupported origins, private addresses, credentials, HTTP and unsafe redirects are rejected", async () => {
  for (const target of [
    "https://127.0.0.1/image.png", "https://[::1]/image.png", "https://localhost/image.png",
    "https://images.example.com/image.png", "https://freshservice.com.example.com/image.png",
    "https://user:pass@cdn.freshservice.com/image.png", "http://cdn.freshservice.com/image.png",
    "https://cdn.freshservice.com:444/image.png",
  ]) {
    const calls = responses();
    await assert.rejects(api.downloadInlineImage(config, target), /require HTTPS/);
    assert.equal(calls.length, 0);
    const redirect = responses(new Response(null, { status: 302, headers: { Location: target } }));
    await assert.rejects(api.downloadInlineImage(config, url), /supported asset host|HTTPS without URL credentials/);
    assert.equal(redirect.length, 1);
  }
  for (const target of ["https://s3.amazonaws.com/cdn.freshservice.com/image.png", "https://example.s3.eu-west-1.amazonaws.com/image.png"]) {
    assert.equal(api.isInlineImageUrlAllowed(config, new URL(target)), true);
  }
});

test("wrong ticket/comment/image references and non-image responses are reported without unrelated downloads", async (t) => {
  const client = await connect(t);
  for (const args of [{ ticket_id: 7, image_index: 0 }, { ticket_id: 7, image_index: 1, conversation_id: -1 }]) {
    const calls = responses();
    assert.equal((await client.callTool({ name: "download_inline_image", arguments: args })).isError, true);
    assert.equal(calls.length, 0);
  }
  for (const [args, response] of [
    [{ ticket_id: 7, image_index: 2 }, json({ ticket })],
    [{ ticket_id: 7, image_index: 1, conversation_id: 9 }, json({ conversations: [conversation] })],
    [{ ticket_id: 7, image_index: 1 }, json({ ticket: { ...ticket, description: "<img src='https://images.example.com/image.png'>" } })],
  ]) {
    const calls = responses(response);
    assert.equal((await client.callTool({ name: "download_inline_image", arguments: args })).isError, true);
    assert.equal(calls.length, 1);
  }
  responses(json({ ticket }), new Response("<html>Login required</html>", { headers: { "Content-Type": "text/html" } }));
  const result = await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, image_index: 1 } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /did not return an image/);
  const denied = responses(new Response("Access denied", { status: 403 }));
  assert.equal((await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, image_index: 1 } })).isError, true);
  assert.equal(denied.length, 1);
});

test("inline download preserves image formats, errors and size limits", async (t) => {
  const client = await connect(t);
  responses(json({ ticket }), new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }));
  const result = await client.callTool({ name: "download_inline_image", arguments: { ticket_id: 7, image_index: 1 } });
  assert.deepEqual(result.content, [{ type: "resource", resource: {
    uri: "freshservice://tickets/7/description/inline-images/1", mimeType: "image/svg+xml", blob: Buffer.from("<svg/>").toString("base64"),
  } }]);
  responses(new Response("secret", { status: 403 }));
  await assert.rejects(api.downloadInlineImage(config, url), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /token|secret/);
    return true;
  });
  responses(new Response(null, { headers: { "Content-Length": String(api.MAX_ATTACHMENT_BYTES + 1) } }));
  await assert.rejects(api.downloadInlineImage(config, url), /10 MiB/);
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(api.MAX_ATTACHMENT_BYTES + 1)); },
    cancel() { canceled = true; },
  });
  responses(new Response(stream));
  await assert.rejects(api.downloadInlineImage(config, url), /10 MiB/);
  assert.equal(canceled, true);
  const calls = responses();
  await assert.rejects(api.downloadInlineImage(config, `data:image/png;base64,${"A".repeat(Math.ceil(api.MAX_ATTACHMENT_BYTES / 3) * 4 + 4)}`), /10 MiB/);
  assert.equal(calls.length, 0);
});
