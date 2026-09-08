# freshservice-mcp

[![npm version](https://img.shields.io/npm/v/freshservice-mcp)](https://www.npmjs.com/package/freshservice-mcp)
[![npm downloads](https://img.shields.io/npm/dm/freshservice-mcp)](https://www.npmjs.com/package/freshservice-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Freshservice](https://freshservice.com). Manage your ITSM tickets, changes, conversations, and agents directly from any MCP-compatible AI client (Kiro, Claude Desktop, Cursor, etc.).

## Features

- 📋 **List tickets** — powerful filter queries or built-in presets
- 🔍 **Get ticket details** — full description, stats, and metadata
- 💬 **Read conversations** — all replies and internal notes
- ✏️ **Create tickets** — with full field support
- 🔄 **Update tickets** — status, priority, assignment, tags
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

Set `FRESHSERVICE_READONLY` to `"true"` to prevent any modifications. In this mode, only ticket, Change, and agent read tools are registered; all create, update, association, note, and reply tools are omitted. Recommended for shared environments or autonomous agent setups against production instances.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets with filter query or built-in preset |
| `get_ticket` | Get full details of a single ticket |
| `get_ticket_comments` | Get all conversations for a ticket |
| `create_ticket` | Create a new ticket |
| `update_ticket` | Update ticket fields |
| `add_ticket_note` | Add a private note or public reply |
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

> **Note:** `dist/index.js` is a self-contained esbuild bundle with all dependencies inlined. No `npm install` needed at runtime — just Node.js 18+.

### Standalone file deployment

If you don't want to clone the repo, just grab `dist/index.js` — it's a single 750KB file that runs standalone with `node`. No package manager required.

## Troubleshooting

### Server won't start

1. Verify Node.js 18+: `node --version`
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
