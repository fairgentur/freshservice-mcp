# freshservice-mcp

[![npm version](https://img.shields.io/npm/v/freshservice-mcp)](https://www.npmjs.com/package/freshservice-mcp)
[![npm downloads](https://img.shields.io/npm/dm/freshservice-mcp)](https://www.npmjs.com/package/freshservice-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Freshservice](https://freshservice.com). Manage your ITSM tickets, changes, conversations, and agents directly from any MCP-compatible AI client (Kiro, Claude Desktop, Cursor, etc.).

## Features

- 📋 **List tickets** — powerful filter queries or built-in presets
- 🔍 **Get ticket details** — full description, stats, and metadata
- 💬 **Read conversations** — all replies and internal notes
- 📎 **Retrieve attachments** — list ticket, conversation and service-request form files, download their contents
- ✏️ **Create tickets** — with full field support
- 🛒 **Service catalog requests** — discover catalog items and forms, then request through their workflow and routing
- 🔄 **Update tickets** — status, priority, assignment, tags
- 🧩 **Custom fields** — discover instance-specific ticket fields and read/write them
- 📝 **Add notes or replies** — private notes or public replies
- 🗂️ **Manage changes** — list, inspect, create, and update Changes
- 🔗 **Associate tickets with changes** — supports both Freshservice relationship directions
- 📝 **Add change notes** — add HTML-formatted notes to Changes
- 👤 **Agent lookup** — get your own profile or search by email
- 🔒 **Read-only mode** — disable all write operations with one env var

## Quickstart

### 1. Get your Freshservice API key

Log into Freshservice → click your avatar (top right) → **Profile Settings** → copy **Your API Key**.

> ⚠️ Each user must use their own API key. Keys are tied to individual agent accounts — actions appear under that agent's name.

### 2. Configure your MCP client

Add this block to your client's MCP configuration:

```json
{
  "mcpServers": {
    "freshservice": {
      "command": "npx",
      "args": ["-y", "freshservice-mcp"],
      "env": {
        "FRESHSERVICE_DOMAIN": "yourcompany.freshservice.com",
        "FRESHSERVICE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Configuration file locations:**

| Client | File |
|--------|------|
| Kiro (global) | `~/.kiro/settings/mcp.json` |
| Kiro (workspace) | `.kiro/settings/mcp.json` |
| KiroCrew | `~/.kiro/settings/mcp.json`, then run `kirocrew setup --agent-only` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` or Cursor Settings |

### 3. Reload your client

Reconnect MCP servers (or reload the window). You should now have access to all Freshservice tools.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FRESHSERVICE_DOMAIN` | ✅ | Your Freshservice domain, e.g. `yourcompany.freshservice.com` |
| `FRESHSERVICE_API_KEY` | ✅ | Your personal API key from Profile Settings |
| `FRESHSERVICE_READONLY` | optional | Set to `"true"` to disable all write operations |

### Read-only mode

Set `FRESHSERVICE_READONLY` to `"true"` to prevent any modifications. In this mode, only ticket, service catalog, Change, and agent read tools are registered; all create, update, association, note, and reply tools are omitted, including `place_service_request`. Recommended for shared environments or autonomous agent setups against production instances.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets with filter query or built-in preset |
| `get_ticket` | Get full details of a single ticket |
| `get_ticket_comments` | Get all conversations for a ticket |
| `list_ticket_attachments` | List files from a ticket, all its conversations and service-request forms, with source context |
| `download_attachment` | Download file contents by attachment ID (up to 10 MiB) |
| `create_ticket` | Create a new ticket |
| `update_ticket` | Update ticket fields |
| `add_ticket_note` | Add a private note or public reply |
| `list_ticket_fields` | List ticket form fields with internal names, types and dropdown choices |
| `list_service_catalog_items` | List catalog items, optionally filter by category and name |
| `get_service_catalog_item` | Get a catalog item and its form fields with internal names, required flags and choices |
| `place_service_request` | Create a service request through a catalog item's form, workflow and routing |
| `list_changes` | List Changes with query/view filters, sorting, and pagination |
| `get_change` | Get full details of a Change |
| `create_change` | Create a Change |
| `update_change` | Update Change fields |
| `associate_tickets_to_change` | Associate one or more tickets with a Change |
| `add_change_note` | Add a note to a Change |
| `get_me` | Get the authenticated agent's profile |
| `list_agents` | List agents, optionally filter by email |

## Usage Examples

### Check your connection

```
Call get_me to verify the connection works.
```

### List your open tickets

```
Get my agent ID with get_me, then list all open and pending tickets assigned to me.
```

The agent will call `get_me` → `list_tickets` with `query: "agent_id:<id> AND (status:2 OR status:3)"`.

### Investigate a ticket

```
Show me ticket #12345 including all comments.
```

### Add an internal note

```
Add a private note to ticket #12345: "Root cause identified — fix scheduled for tonight."
```

### Create a ticket

```
Create a high-priority incident with subject "VPN not connecting" and assign to group 1234.
```

## Filter Query Syntax

The `list_tickets` tool accepts Freshservice's filter query language.

### Built-in presets (`filter` parameter)

| Preset | Description |
|--------|-------------|
| `new_and_my_open` | New tickets + tickets assigned to you |
| `watching` | Tickets you are watching |
| `spam` | Spam tickets |
| `deleted` | Deleted tickets |

### Custom queries (`query` parameter)

Fields can be combined with `AND` / `OR`:

```
agent_id:123                       → assigned to specific agent
status:2                           → open tickets
status:2 OR status:3               → open or pending
agent_id:123 AND status:2          → open tickets assigned to agent 123
priority:3                         → high priority
group_id:456                       → assigned to group 456
created_at:>'2024-01-01'           → created after date
due_by:<'2024-12-31'               → due before date
tag:'production'                   → tagged with "production"
```

### Status codes

| Code | Status |
|------|--------|
| 2 | Open |
| 3 | Pending |
| 4 | Resolved |
| 5 | Closed |

### Priority codes

| Code | Priority |
|------|----------|
| 1 | Low |
| 2 | Medium |
| 3 | High |
| 4 | Urgent |

## Notes vs Replies

The `add_ticket_note` tool has two modes controlled by the `private` parameter:

- `private: true` (default) → **Internal note**, only visible to agents
- `private: false` → **Public reply**, sent to the requester by email

## Creating Tickets

Minimum required fields:
- `subject` (required)
- `email` OR `requester_id` (one of these required)

Useful optional fields:
- `priority` (1–4)
- `status` (default: 2 = Open)
- `type` (e.g. `"Incident"`, `"Service Request"`)
- `group_id` — route to a team
- `responder_id` — assign directly to an agent
- `tags` — categorization
- `custom_fields` — instance-specific fields (see below)

## Custom Fields

Custom ticket fields are addressed by their internal name (`cf_...`), not by the label shown in the UI. Call `list_ticket_fields` to get the names, field types and the allowed values of dropdown fields:

```json
{ "name": "cf_release", "label": "Release", "field_type": "custom_text", "custom": true, "required": false }
```

Then pass them to `create_ticket` or `update_ticket`:

```json
{ "ticket_id": 12345, "custom_fields": { "cf_release": "2024.10", "cf_reviewed": true } }
```

- `update_ticket` sends only the keys you pass; other custom fields keep their values. Pass `null` to clear a field.
- Custom dropdowns take the choice `value`, which must match exactly, otherwise Freshservice rejects the request with a 400. Built-in fields such as `status`, `priority` or `group` take the choice `id` (with `include_default: true`).
- A nested (dependent) dropdown lists its lower levels under `nested_fields`; set each level under its own `name`.
- `required` reflects whether the field is mandatory for agents.
- `get_ticket` and `list_tickets` return a ticket's non-empty custom fields under `custom_fields`.

## Service Catalog

Use `place_service_request` when your organisation routes a ticket type through a catalog
item. Creating a plain ticket with `create_ticket`, even with `type: "Service Request"`,
bypasses the catalog item's form, workflow and routing.

Example flow for an instance at `yourcompany.freshservice.com`:

1. Call `list_service_catalog_items` with `search: "Equipment"` to find an item.
   It returns compact entries with `display_id`, `name`, `category` (the category ID),
   `short_description` and `visibility` (`1` = draft, `2` = published). You can filter by
   `category_id`, set `limit` (default 100, maximum 500), or start at a particular `page`.
   The list endpoint has no name filter, so search matches names locally, ignoring case,
   across pages of at most 30 items until the matching limit or the end of the catalog.
   Listing uses the primary workspace, as Freshservice does by default.
2. Call `get_service_catalog_item` with the chosen `display_id` (not its internal `id`).
   The returned `fields` use the same shape as `list_ticket_fields`: internal `name`,
   `label`, `field_type`, `required`, dropdown `choices` and `nested_fields` for lower levels.
3. Call `place_service_request` with that `display_id`, `email: "requester@example.com"`
   and a `custom_fields` object using the exact names and choice values returned in step 2.
   Set each nested level under its own name. Supply required fields even if hidden from
   requesters. `quantity` defaults to 1; `email` is optional (defaults to the authenticated
   agent), and `requested_for` optionally specifies another person's email.
4. Optionally call `update_ticket` with the returned ticket `id` to set `priority: "3"`
   (High), `tags: ["example"]` or a `group_id` discovered via `list_ticket_fields` with
   `include_default: true`. The `place_service_request` result starts with
   `Service request #<id> created.` and includes the same normalized ticket fields and URL
   as `create_ticket`.

The supported request fields follow Freshservice's
[`place_request` documentation](https://api.freshservice.com/#create_service_request).
`subject`, `description`, tags, priority and group are not inputs to this endpoint.
The catalog item supplies the subject. `place_service_request` performs a single POST;
it makes no automatic ticket updates. For rich-text custom fields, send raw HTML tags
such as `<p>Details</p>`, never escaped markup such as `&lt;p&gt;Details&lt;/p&gt;`.
Custom-field values support strings, numbers, booleans and `null` to clear a field;
multi-value arrays, file uploads and child-item payloads are not supported by this tool.
Freshservice validation errors retain the field-level `errors` array so missing required
fields and invalid values can be corrected.

Follow-up `update_ticket` uses [`PUT /api/v2/tickets/{id}`](https://api.freshservice.com/#update_ticket),
which also supports Service Request tickets. Normal permissions, workflows and mandatory
ticket-field checks still apply; for example, if an empty description is rejected, supply
a meaningful `description` in the explicit update. Tags replace the existing tag list,
so include all tags you want to retain. The update's `custom_fields` refer to ticket form
fields; catalog form values belong to requested items and require Freshservice's separate
[`requested_items` update API](https://api.freshservice.com/#update_requested_items),
which is not exposed as a write tool here. The list and get catalog tools are available
in read-only mode; placing requests and updating tickets are not.

## Attachments

`get_ticket` returns ticket attachment metadata under `attachments` (included by default).
`get_ticket_comments` returns attachment metadata on each conversation and follows all pages.
For a combined list, call `list_ticket_attachments` with `ticket_id`. Each entry contains the
metadata supplied by Freshservice (ID, name, content type, size, attachment URL and dates),
plus `source` (`ticket`, `conversation` or `requested_item`), `conversation_id` and `private`
(null for ticket and requested-item files). For service requests, the list also reads all pages
of [`requested_items`](https://api.freshservice.com/#view_requested_items), including their
top-level attachments and attachment-valued custom fields. These entries include
`requested_item_id`, `service_item_id`, `service_item_name` and, where applicable, `field_name`.
Files repeated in an item's main array and attachment field are listed once. Incidents do not
call the service-request endpoint. A failure to read requested items is reported as an error,
so an incomplete list cannot be mistaken for an empty one.

An empty `get_ticket.attachments` array does not rule out files on a service-request form;
use `list_ticket_attachments` for the complete list. Inline HTML images are not extracted.
All attachment tools work in read-only mode.

```
List the attachments on ticket #12345, then download the log file and the screenshot.
```

Use an attachment's `id` with `download_attachment`:

```json
{ "attachment_id": 19852343 }
```

The tool uses Freshservice's authenticated [`GET /api/v2/attachments/[id]`](https://api.freshservice.com/#download_attachment)
endpoint. The API agent must have access to the parent entity. Text files are returned as
embedded text resources, PNG/JPEG/GIF/WebP as MCP images, and other files (including PDFs)
as base64 embedded resources. Rendering or extracting binary resources depends on the MCP client.
If Freshservice omits an ID, the listed `attachment_url` remains available for direct download.

Downloads have a 30-second timeout and a 10 MiB limit, enforced while reading the response
even without a Content-Length header. Larger files can be downloaded directly using the
listed URL. HTTPS redirects to signed CDN URLs are supported without forwarding the API key
outside the Freshservice origin. The server does not write files to disk.

## Change Management

Freshservice Changes use numeric values for their standard fields:

- Status: 1=Open, 2=Planning, 3=Awaiting Approval, 4=Pending Release, 5=Pending Review, 6=Closed
- Change type: 1=Minor, 2=Standard, 3=Major, 4=Emergency
- Priority: 1=Low, 2=Medium, 3=High, 4=Urgent
- Impact: 1=Low, 2=Medium, 3=High
- Risk: 1=Low, 2=Medium, 3=High, 4=Very High

`associate_tickets_to_change` uses the association shape documented by Freshservice's Ticket API. The default relationship, `change_initiated_by_ticket`, means the ticket initiated the Change. Use `association_type: "change_initiating_ticket"` when the Change initiated the ticket. `change_id` is placed in the documented nested `display_id` field.

Because the association is applied as a ticket update, Freshservice validates the whole ticket — so on an instance where `description` is a mandatory field, a ticket with an empty description would otherwise be rejected with a 400. The tool handles this transparently: it retries once with a minimal placeholder description, and only for tickets that genuinely have none. Existing descriptions are never overwritten.

## Local Development

```bash
git clone https://github.com/fairgentur/freshservice-mcp.git
cd freshservice-mcp
npm install
npm run build
```

Node.js 22 or newer is required; use a maintained LTS release (24 or 26 recommended).
The patched dependency tree includes an HTTP adapter requiring Node.js 20+, so Node.js 18
is no longer supported. CI covers Node.js 22, 24 and 26.

Run `npm run typecheck`, `npm test` and `npm audit` to check types, regression tests and dependencies.
The tests use mock HTTP responses and MCP clients; no Freshservice credentials are needed.
Release publishing repeats the typecheck, build and tests and checks production dependencies
for high/critical advisories. Tool arguments have a total ceiling of 10,000 object keys and
array elements before schema validation.

Then point your MCP client at the local build:

```json
{
  "mcpServers": {
    "freshservice": {
      "command": "node",
      "args": ["/absolute/path/to/freshservice-mcp/dist/index.js"],
      "env": {
        "FRESHSERVICE_DOMAIN": "yourcompany.freshservice.com",
        "FRESHSERVICE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> **Note:** `dist/index.js` is a self-contained esbuild bundle with all dependencies inlined. No `npm install` needed at runtime — just Node.js 22+.

### Standalone file deployment

If you don't want to clone the repo, just grab `dist/index.js` — it's a single file that runs standalone with `node`. No package manager required.

## Troubleshooting

### Server won't start

1. Verify Node.js 22+: `node --version`
2. Check environment variables are set correctly
3. Test manually: `FRESHSERVICE_DOMAIN=yourcompany.freshservice.com FRESHSERVICE_API_KEY=yourkey node dist/index.js`

### Authentication errors (401)

- Verify the domain — should be `yourcompany.freshservice.com` without `https://`
- Regenerate your API key in Freshservice Profile Settings
- API keys use HTTP Basic Auth (`key:X` base64-encoded)

### Filter queries return 500

Freshservice requires filter queries wrapped in double quotes internally. The server handles this automatically — do **not** add quotes around your query string yourself.

## Contributing

Pull requests welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE)
