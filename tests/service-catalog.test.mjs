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
const buildDir = await mkdtemp(join(testRoot, "service-catalog-"));
const entry = join(buildDir, "entry.mjs");
await build({
  stdin: {
    contents: [
      'export * from "./src/freshservice-client.js";',
      'export * from "./src/tools/service-catalog.js";',
      'export * from "./src/tools/ticket-fields.js";',
      'export * from "./src/tools/tickets.js";',
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
const auth = `Basic ${Buffer.from("test-key:X").toString("base64")}`;
const item = {
  id: 1001, display_id: 7, name: "Example equipment", category_id: 9,
  short_description: "Example catalog request", visibility: 2,
  description: "<p>Example item details</p>", allow_quantity: true,
  custom_fields: [
    {
      id: "field-1", name: "cf_example_text", label: "Example text",
      field_type: "custom_text", required: true,
      field_options: { displayed_to_requester: false },
    },
    {
      id: "field-2", name: "cf_example_choice", label: "Example choice",
      field_type: "custom_nested_field", required: true,
      choices: [
        { id: 31, value: "Option A", position: 1, nested_options: [
          { id: 41, value: "Level B", choices: ["Level C"] },
        ] },
        "Standalone",
      ],
      nested_fields: [
        { id: 32, name: "cf_example_level2", label: "Level 2", level: 2 },
        { id: 33, name: "cf_example_level3", label: "Level 3", level: 3 },
      ],
    },
    {
      name: "cf_example_details", label: "Example details", field_type: "custom_rich_text",
      description: "Additional details", choices: [], nested_fields: [],
    },
  ],
};
const fields = [
  {
    name: "cf_example_text", label: "Example text", field_type: "custom_text",
    custom: true, required: true, required_for_closure: false,
  },
  {
    name: "cf_example_choice", label: "Example choice", field_type: "custom_nested_field",
    custom: true, required: true, required_for_closure: false,
    choices: [
      { id: 31, value: "Option A", sub_choices: [
        { id: 41, value: "Level B", sub_choices: ["Level C"] },
      ] },
      "Standalone",
    ],
    nested_fields: [
      { name: "cf_example_level2", label: "Level 2", level: 2 },
      { name: "cf_example_level3", label: "Level 3", level: 3 },
    ],
  },
  {
    name: "cf_example_details", label: "Example details", field_type: "custom_rich_text",
    custom: true, required: false, required_for_closure: false, description: "Additional details",
  },
];
const ticket = {
  id: 11, subject: "Example service request", status: 2, priority: 2, type: "Service Request",
  requester_id: 21, group_id: 9, created_at: "2026-01-01T10:00:00Z", updated_at: "2026-01-01T10:00:00Z",
  custom_fields: { cf_example_text: "Kept", cf_example_empty: null },
};
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
  const server = new McpServer({ name: "catalog-test", version: "1.0.0" });
  api.registerServiceCatalogTools(server, config, readonly);
  api.registerTicketFieldTools(server, config);
  if (!readonly) api.registerTicketTools(server, config);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

function createdTicket(result) {
  assert.equal(result.isError, undefined);
  return JSON.parse(result.content[0].text.split("\n\n")[1]);
}

test("place request authenticates one POST and preserves form values, raw HTML and null", async (t) => {
  const client = await connect(t);
  const custom_fields = {
    cf_example_text: "Example", cf_example_number: 3, cf_example_flag: false, cf_example_clear: null,
    cf_example_details: "<p>Details &amp; <b>formatting</b></p>",
  };
  const calls = responses(json({ service_request: ticket }));
  const result = await client.callTool({ name: "place_service_request", arguments: {
    display_id: item.display_id, email: "requester@example.com", requested_for: "person@example.com", custom_fields,
  } });
  const normalized = createdTicket(result);
  assert.match(result.content[0].text, /^Service request #11 created\.\n\n/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, `${origin}/api/v2/service_catalog/items/7/place_request`);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, auth);
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    quantity: 1, email: "requester@example.com", requested_for: "person@example.com", custom_fields,
  });
  assert.deepEqual(normalized, {
    id: 11, subject: ticket.subject, status: "Open", priority: "Medium", type: "Service Request",
    requester: 21, responder_id: null, group_id: 9, tags: [], created_at: ticket.created_at,
    updated_at: ticket.updated_at, due_by: null, custom_fields: { cf_example_text: "Kept" },
    url: `${origin}/helpdesk/tickets/11`,
  });

  responses(json({ ticket }));
  const ordinary = await client.callTool({ name: "create_ticket", arguments: { subject: ticket.subject, email: "requester@example.com" } });
  assert.deepEqual(normalized, createdTicket(ordinary));
});

test("quantity overrides and omitted or empty form values retain their meaning", async (t) => {
  const client = await connect(t);
  for (const custom_fields of [undefined, {}]) {
    const calls = responses(json({ service_request: ticket }));
    const args = { display_id: 7, quantity: 2, ...(custom_fields === undefined ? {} : { custom_fields }) };
    const result = await client.callTool({ name: "place_service_request", arguments: args });
    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].options.body), custom_fields === undefined ? { quantity: 2 } : { quantity: 2, custom_fields: {} });
  }
  const calls = responses(json({ service_request: ticket }));
  assert.deepEqual(await api.placeServiceRequest(config, 7), ticket);
  assert.deepEqual(JSON.parse(calls[0].options.body), { quantity: 1 });
});

test("Freshservice 400 errors retain required form field names and allowed values", async (t) => {
  const client = await connect(t);
  const errors = [
    { field: "custom_fields.cf_example_text", message: "It should not be blank", code: "missing_field" },
    { field: "custom_fields.cf_example_choice", message: "Allowed values: Option A, Option B", code: "invalid_value" },
  ];
  const calls = responses(new Response(JSON.stringify({ description: "Validation failed", errors }), { status: 400 }));
  const result = await client.callTool({ name: "place_service_request", arguments: { display_id: 7 } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /POST service_catalog\/items\/7\/place_request.*400/);
  assert.ok(result.content[0].text.includes(JSON.stringify(errors)));
  assert.equal(calls.length, 1);
});

for (const readonly of [false, true]) {
  test(`catalog form discovery preserves field names, dropdowns and nested levels (readonly=${readonly})`, async (t) => {
    const client = await connect(t, readonly);
    const calls = responses(json({ service_item: item }));
    const result = await client.callTool({ name: "get_service_catalog_item", arguments: { display_id: 7 } });
    assert.equal(result.isError, undefined);
    const { custom_fields, ...details } = item;
    assert.deepEqual(JSON.parse(result.content[0].text), { ...details, fields });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.href, `${origin}/api/v2/service_catalog/items/7`);
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.headers.Authorization, auth);

    responses(json({ ticket_fields: custom_fields.map((field) => ({ ...field, default_field: false })) }));
    const ticketFields = await client.callTool({ name: "list_ticket_fields", arguments: {} });
    assert.deepEqual(JSON.parse(ticketFields.content[0].text).fields, fields);
  });

  test(`catalog reads are available and writes respect readonly=${readonly}`, async (t) => {
    const client = await connect(t, readonly);
    const { tools } = await client.listTools();
    for (const name of ["list_service_catalog_items", "get_service_catalog_item"]) {
      assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
    }
    const write = tools.find((tool) => tool.name === "place_service_request");
    assert.equal(Boolean(write), !readonly);
    if (write) {
      assert.deepEqual(Object.keys(write.inputSchema.properties).sort(), ["custom_fields", "display_id", "email", "quantity", "requested_for"]);
      assert.deepEqual(write.inputSchema.required, ["display_id"]);
      assert.equal(write.inputSchema.properties.quantity.default, 1);
      assert.match(write.description, /instead of create_ticket/);
      assert.match(write.description, /get_service_catalog_item first/);
      assert.match(write.description, /update_ticket on the returned id/);
      assert.match(write.inputSchema.properties.custom_fields.description, /RAW tags/);
    }
    const calls = responses(json({ service_items: [item] }));
    const result = await client.callTool({ name: "list_service_catalog_items", arguments: {} });
    assert.deepEqual(JSON.parse(result.content[0].text), { count: 1, service_items: [{
      display_id: 7, name: item.name, category: 9, short_description: item.short_description, visibility: 2,
    }] });
    assert.equal(calls[0].url.pathname, "/api/v2/service_catalog/items");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.headers.Authorization, auth);
  });
}

test("name search follows full pages without matches, carries category and limits matching items", async (t) => {
  const client = await connect(t);
  const otherItems = Array.from({ length: 30 }, (_, i) => ({ ...item, display_id: 100 + i, name: `Other item ${i}` }));
  const calls = responses(
    json({ service_items: otherItems }),
    json({ service_items: otherItems }),
    json({ service_items: [item, { ...item, display_id: 8, name: "EXAMPLE EQUIPMENT" }, { ...item, display_id: 9 }] })
  );
  const result = await client.callTool({ name: "list_service_catalog_items", arguments: {
    category_id: 9, search: "  eQuIpMeNt  ", limit: 2, page: 2,
  } });
  const listed = JSON.parse(result.content[0].text);
  assert.equal(listed.count, 2);
  assert.deepEqual(listed.service_items.map((entry) => entry.display_id), [7, 8]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.url.searchParams.get("page")), ["2", "3", "4"]);
  for (const call of calls) {
    assert.equal(call.url.searchParams.get("per_page"), "30");
    assert.equal(call.url.searchParams.get("category_id"), "9");
    assert.equal(call.url.searchParams.has("search"), false);
  }
});

test("catalog pagination caps results and stops at an empty final page", async () => {
  const batch = Array.from({ length: 30 }, (_, i) => ({ ...item, display_id: i + 1 }));
  const calls = responses(json({ service_items: batch }), json({ service_items: batch }));
  assert.equal((await api.listServiceCatalogItems(config, { limit: 31 })).length, 31);
  assert.equal(calls.length, 2);
  const exhausted = responses(json({ service_items: batch }), json({ service_items: [] }));
  assert.equal((await api.listServiceCatalogItems(config)).length, 30);
  assert.equal(exhausted.length, 2);
  assert.equal(exhausted[1].url.searchParams.get("page"), "2");
});

test("empty catalog lists and items without custom fields are supported", async (t) => {
  const client = await connect(t);
  for (const response of [{ service_items: [] }, {}]) {
    responses(json(response));
    const result = await client.callTool({ name: "list_service_catalog_items", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "No service catalog items found.");
  }
  for (const custom_fields of [[], undefined]) {
    responses(json({ service_item: { ...item, custom_fields } }));
    const result = await client.callTool({ name: "get_service_catalog_item", arguments: { display_id: 7 } });
    assert.deepEqual(JSON.parse(result.content[0].text).fields, []);
  }
});

test("invalid request inputs fail before HTTP writes", async (t) => {
  const client = await connect(t);
  for (const args of [
    {}, { display_id: 0 }, { display_id: -1 }, { display_id: 1.5 },
    { display_id: 7, quantity: 0 }, { display_id: 7, quantity: -1 }, { display_id: 7, quantity: 1.5 },
    { display_id: 7, email: "invalid" }, { display_id: 7, requested_for: "invalid" },
    { display_id: 7, custom_fields: { cf_example_bad: ["value"] } },
    { display_id: 7, custom_fields: { cf_example_bad: { nested: "value" } } },
  ]) {
    const calls = responses();
    const result = await client.callTool({ name: "place_service_request", arguments: args });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0);
  }
});

test("update_ticket explicitly sets service-request tags, priority and group using the returned id", async (t) => {
  const client = await connect(t);
  const updated = { ...ticket, tags: ["example"], priority: 3, group_id: 10 };
  const calls = responses(json({ service_request: ticket }), json({ ticket: updated }));
  const placed = await client.callTool({ name: "place_service_request", arguments: { display_id: 7 } });
  const id = createdTicket(placed).id;
  assert.equal(calls.length, 1);
  const result = await client.callTool({ name: "update_ticket", arguments: {
    ticket_id: id, tags: ["example"], priority: "3", group_id: 10,
  } });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /^Ticket #11 updated\./);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.href, `${origin}/api/v2/tickets/11`);
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].options.body), { tags: ["example"], priority: 3, group_id: 10 });
  const normalized = createdTicket(result);
  assert.equal(normalized.type, "Service Request");
  assert.equal(normalized.priority, "High");
  assert.equal(normalized.group_id, 10);
  assert.deepEqual(normalized.tags, ["example"]);
});

test("follow-up ticket validation errors are surfaced without an implicit retry", async (t) => {
  const client = await connect(t);
  const error = { errors: [{ field: "description", message: "It should not be blank", code: "missing_field" }] };
  const calls = responses(new Response(JSON.stringify(error), { status: 400 }));
  const result = await client.callTool({ name: "update_ticket", arguments: { ticket_id: 11, priority: "3" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /description/);
  assert.equal(calls.length, 1);
});

for (const readonly of [false, true]) {
  test(`standalone bundle registers catalog tools and version (readonly=${readonly})`, async (t) => {
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "dist/index.js")],
      env: { FRESHSERVICE_DOMAIN: config.domain, FRESHSERVICE_API_KEY: config.apiKey, FRESHSERVICE_READONLY: String(readonly) },
      stderr: "pipe",
    });
    t.after(() => client.close());
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, "0.6.0");
    const { tools } = await client.listTools();
    for (const name of ["list_service_catalog_items", "get_service_catalog_item"]) {
      assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
    }
    for (const name of ["place_service_request", "update_ticket"]) {
      assert.equal(tools.some((tool) => tool.name === name), !readonly);
    }
  });
}
