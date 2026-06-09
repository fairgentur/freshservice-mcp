---
inclusion: manual
---

# Freshservice MCP – Setup & Configuration

## Quickstart (3 steps)

### 1. Get your Freshservice API key
Log into Freshservice → click your avatar (top right) → **Profile Settings** → copy **Your API Key**.

### 2. Add to mcp.json
Edit `~/.kiro/settings/mcp.json` (or your workspace `.kiro/settings/mcp.json`):

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

### 3. Reload Kiro
Open the Command Palette → **MCP: Reconnect servers** (or reload the window).

---

## Local development setup

If you have cloned the repo and want to run from source:

```json
{
  "mcpServers": {
    "freshservice": {
      "command": "node",
      "args": ["/path/to/freshservice-power/dist/index.js"],
      "env": {
        "FRESHSERVICE_DOMAIN": "yourcompany.freshservice.com",
        "FRESHSERVICE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Build first with:
```bash
cd freshservice-power
npm install
npm run build
```

---

## Read-only mode

To prevent any write operations (useful in shared workspaces or for review-only workflows):

```json
"env": {
  "FRESHSERVICE_DOMAIN": "yourcompany.freshservice.com",
  "FRESHSERVICE_API_KEY": "your-api-key-here",
  "FRESHSERVICE_READONLY": "true"
}
```

In read-only mode, `create_ticket`, `update_ticket` and `add_ticket_note` are not registered.

---

## Verifying the connection

Once the server is running, test it by asking Kiro:
```
Call get_me from freshservice to check the connection.
```

This should return your agent profile without making any changes.
