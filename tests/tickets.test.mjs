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
const buildDir = await mkdtemp(join(testRoot, "tickets-"));
const entry = join(buildDir, "entry.mjs");
await build({
  stdin: {
    contents: [
      'export * from "./src/freshservice-client.js";',
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
  target: "node22",
  format: "esm",
});
const api = await import(pathToFileURL(entry).href);
after(() => rm(buildDir, { recursive: true, force: true }));
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const config = { domain: "yourcompany.freshservice.com", apiKey: "test-key" };
const origin = `https://${config.domain}`;
const ticket = { id: 7, subject: "Example request", status: 2, priority: 2, type: "Service Request" };
const categoryFields = {
  category: "  Example category & more  ", sub_category: "Example / sub-category", item_category: "Example item category",
};
const validationHint = "Freshservice validates all mandatory fields on update; include the listed fields in the same call.";
const errors = [
  {
    field: "category", code: "invalid_value",
    message: "It should be one of these values: " + Array.from({ length: 200 }, (_, i) => `'Example choice ${i}'`).join(", "),
  },
  { field: "sub_category", message: "It should not be blank", code: "missing_field" },
  { field: "item_category", message: "It should not be blank", code: "missing_field" },
  { field: "description", message: "It should not be blank as this is a mandatory field", code: "missing_field" },
];
const validationBody = JSON.stringify({ description: "Validation failed", errors }, null, 2);
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
  const server = new McpServer({ name: "ticket-test", version: "1.0.0" });
  (readonly ? api.registerReadOnlyTicketTools : api.registerTicketTools)(server, config);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

test("one update sends all mandatory default fields and intended changes as top-level values", async (t) => {
  const client = await connect(t);
  const changes = {
    subject: "Updated example request", description: "<p>Example &amp; <b>details</b></p>",
    ...categoryFields, tags: ["example"], custom_fields: { cf_example: false },
  };
  const calls = responses(json({ ticket: { ...ticket, ...changes } }));
  const result = await client.callTool({ name: "update_ticket", arguments: { ticket_id: 7, ...changes } });
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, `${origin}/api/v2/tickets/7`);
  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), changes);
  const normalized = JSON.parse(result.content[0].text.split("\n\n")[1]);
  for (const [name, value] of Object.entries(categoryFields)) assert.equal(normalized[name], value);
});

test("create_ticket also sends all three category levels at the top level unchanged", async (t) => {
  const client = await connect(t);
  const args = { subject: ticket.subject, email: "requester@example.com", ...categoryFields };
  const calls = responses(json({ ticket: { ...ticket, ...categoryFields } }));
  const result = await client.callTool({ name: "create_ticket", arguments: args });
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, `${origin}/api/v2/tickets`);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { ...args, priority: 2, status: 2 });
});

test("category fields are optional and empty strings are passed through without local choice validation", async (t) => {
  const client = await connect(t);
  for (const name of ["create_ticket", "update_ticket"]) {
    const base = name === "create_ticket" ? { subject: ticket.subject, email: "requester@example.com" } : { ticket_id: 7 };
    for (const categories of [undefined, { category: "", sub_category: "", item_category: "" }]) {
      const calls = responses(json({ ticket }));
      const result = await client.callTool({ name, arguments: { ...base, ...categories } });
      assert.equal(result.isError, undefined);
      assert.equal(calls.length, 1);
      const sent = JSON.parse(calls[0].options.body);
      for (const field of Object.keys(categoryFields)) {
        assert.equal(Object.hasOwn(sent, field), categories !== undefined);
        if (categories !== undefined) assert.equal(sent[field], "");
      }
    }
  }
});

test("the MCP schema exposes optional category strings and explains mandatory field checks", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  for (const name of ["create_ticket", "update_ticket"]) {
    const tool = tools.find((tool) => tool.name === name);
    for (const field of Object.keys(categoryFields)) {
      assert.equal(tool.inputSchema.properties[field].type, "string");
      assert.equal(tool.inputSchema.properties[field].enum, undefined);
      assert.equal(tool.inputSchema.required.includes(field), false);
    }
  }
  const update = tools.find((tool) => tool.name === "update_ticket");
  assert.match(update.description, /ALL mandatory fields/);
  assert.match(update.description, /usually have an empty description and no category/);
});

test("400 ticket validation preserves every error verbatim beyond 2000 characters with one hint", async (t) => {
  const client = await connect(t);
  assert.ok(validationBody.length > 2000);
  const calls = responses(new Response(validationBody, { status: 400 }));
  const result = await client.callTool({ name: "update_ticket", arguments: { ticket_id: 7, subject: "Updated", tags: ["example"] } });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, `Freshservice API PUT tickets/7 → 400: ${validationBody}\n${validationHint}`);
  assert.equal(result.content[0].text.split(validationHint).length - 1, 1);
  assert.equal(calls.length, 1);
});

test("create and catalog validation responses also preserve complete API errors", async (t) => {
  const client = await connect(t);
  responses(new Response(validationBody, { status: 400 }));
  const result = await client.callTool({ name: "create_ticket", arguments: { subject: ticket.subject, email: "requester@example.com" } });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, `Freshservice API POST tickets → 400: ${validationBody}`);
  responses(new Response(validationBody, { status: 400 }));
  await assert.rejects(api.placeServiceRequest(config, 9), (error) => {
    assert.equal(error.message, `Freshservice API POST service_catalog/items/9/place_request → 400: ${validationBody}`);
    return true;
  });
});

test("malformed and non-validation errors keep their existing bounded HTTP error output", async () => {
  for (const [status, body] of [
    [400, "Bad request"], [400, '{"errors":['], [400, JSON.stringify({ message: "x".repeat(2500) })],
    [403, validationBody], [500, "x".repeat(2500)],
  ]) {
    responses(new Response(body, { status }));
    await assert.rejects(api.updateTicket(config, 7, { subject: "Updated" }), (error) => {
      assert.equal(error.message, `Freshservice API PUT tickets/7 → ${status}: ${body.slice(0, 2000)}`);
      return true;
    });
  }
});

for (const readonly of [false, true]) {
  test(`get_ticket exposes present and empty category fields and assignment (readonly=${readonly})`, async (t) => {
    const client = await connect(t, readonly);
    for (const details of [
      { ...categoryFields, group_id: 9, description: "<p>Example details</p>" },
      { category: null, sub_category: "", item_category: null, group_id: null, description: "" },
      {},
    ]) {
      const returned = { ...ticket, ...details };
      const calls = responses(json({ ticket: returned }), json({ tickets: [returned] }));
      const result = await client.callTool({ name: "get_ticket", arguments: { ticket_id: 7 } });
      assert.equal(result.isError, undefined);
      const read = JSON.parse(result.content[0].text);
      assert.equal(read.description, details.description ? "Example details" : "");
      const list = await client.callTool({ name: "list_tickets", arguments: {} });
      const listed = JSON.parse(list.content[0].text).tickets[0];
      for (const field of [...Object.keys(categoryFields), "group_id"]) {
        assert.equal(read[field], details[field] ?? null);
        assert.equal(listed[field], details[field] ?? null);
      }
      assert.equal(calls.length, 2);
    }
  });
}
