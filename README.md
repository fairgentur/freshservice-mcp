# freshservice-mcp

[![npm version](https://img.shields.io/npm/v/freshservice-mcp)](https://www.npmjs.com/package/freshservice-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Freshservice](https://freshservice.com). Manage your ITSM tickets, conversations and agents directly from any MCP-compatible AI client (Kiro, Claude Desktop, Cursor, etc.).

## Features

- 📋 **List tickets** with powerful filter queries or built-in presets
- 🔍 **Get ticket details** including description and stats
- 💬 **Read conversations** – all replies and internal notes
- ✏️ **Create tickets** with full field support
- 🔄 **Update tickets** – status, priority, assignment, tags
- 📝 **Add notes or replies** – private notes or public replies
- 👤 **Agent lookup** – get your own profile or search by email

## Quickstart

### 1. Get your Freshservice API key

Log into Freshservice → click your avatar → **Profile Settings** → copy **Your API Key**.

### 2. Configure your MCP client

Add to your `mcp.json`:

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

For **Kiro**: edit `~/.kiro/settings/mcp.json`  
For **Claude Desktop**: edit `~/Library/Application Support/Claude/claude_desktop_config.json`

### 3. Reload your client

Reconnect MCP servers (or reload the window). You should now have access to all Freshservice tools.

## Available Tools

| Tool | Description |
|---|---|
| `list_tickets` | List tickets with filter query or built-in preset |
| `get_ticket` | Get full details of a single ticket |
| `get_ticket_comments` | Get all conversations for a ticket |
| `create_ticket` | Create a new ticket |
| `update_ticket` | Update ticket fields |
| `add_ticket_note` | Add a private note or public reply |
| `get_me` | Get the authenticated agent's profile |
| `list_agents` | List agents, optionally filter by email |

## Configuration

| Variable | Required | Description |
|---|---|---|
| `FRESHSERVICE_DOMAIN` | ✅ | Your domain, e.g. `yourcompany.freshservice.com` |
| `FRESHSERVICE_API_KEY` | ✅ | Your personal API key from Profile Settings |
| `FRESHSERVICE_READONLY` | optional | Set `true` to disable all write operations |

## Filter Query Examples

The `list_tickets` tool accepts Freshservice filter syntax:

```
agent_id:123 AND status:2
status:2 OR status:3
priority:3 AND group_id:456
created_at:>'2024-01-01'
tag:'production'
```

**Status codes:** 2=Open · 3=Pending · 4=Resolved · 5=Closed  
**Priority codes:** 1=Low · 2=Medium · 3=High · 4=Urgent

## Local Development

```bash
git clone https://github.com/fairgentur/kiro-freshservice
cd freshservice-mcp
npm install
npm run build
```

Then point your MCP client at the local build:
```json
"args": ["/path/to/freshservice-mcp/dist/index.js"]
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE)
