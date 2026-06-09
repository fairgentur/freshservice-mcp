---
name: "freshservice"
displayName: "Freshservice ITSM"
description: "Interact with Freshservice tickets, agents and conversations directly from Kiro. List, view, create, update and comment on tickets without leaving your IDE."
keywords: [freshservice, freshworks, itsm, helpdesk, tickets, incidents, service-desk, service-request]
author: "Patrick Gebhardt"
---

# Freshservice ITSM

## Overview

The Freshservice MCP server connects your AI agent directly to Freshservice, the cloud-based IT Service Management platform by Freshworks. Once configured, you can manage your entire ticket queue from within Kiro — no browser switching required.

The server runs locally as a stdio process and communicates with the Freshservice REST API (v2) using your personal API key. All calls are authenticated with HTTP Basic Auth.

**Available capabilities:**
- List tickets with powerful filter queries or built-in presets
- Get full ticket details including description and stats
- Read all conversations (replies and internal notes)
- Create new tickets and assign them to agents or groups
- Update ticket fields (status, priority, assignment, tags)
- Add private notes or public replies to tickets
- Look up agents by email or retrieve your own profile

## Onboarding

### Prerequisites

- Node.js 18 or newer (check: `node --version`)
- A Freshservice account with API access
- Your personal Freshservice API key

### Getting your API key

1. Log in to your Freshservice instance
2. Click your avatar in the top right → **Profile Settings**
3. Scroll to **Your API Key** and copy it

### Installation

**Option A – via Kiro Powers UI (recommended)**

Open the Kiro Powers panel, find "Freshservice ITSM" and click Install.
Then fill in `FRESHSERVICE_DOMAIN` and `FRESHSERVICE_API_KEY` in the configuration dialog.

**Option B – manual mcp.json configuration**

Add the following block to your `~/.kiro/settings/mcp.json` (user-level) or
`.kiro/settings/mcp.json` (workspace-level):

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

Replace `yourcompany.freshservice.com` with your actual domain and add your API key.

### Configuration reference

| Variable | Required | Description |
|---|---|---|
| `FRESHSERVICE_DOMAIN` | ✅ | Your Freshservice domain, e.g. `yourcompany.freshservice.com` |
| `FRESHSERVICE_API_KEY` | ✅ | Your personal API key from Profile Settings |
| `FRESHSERVICE_READONLY` | optional | Set to `true` to disable all write operations |

## Common Workflows

### Workflow 1: Review your open tickets

Quickly see everything assigned to you.

**Steps:**
1. Get your agent ID first
2. List tickets filtered to your ID and open statuses

**Example:**
```
Get my agent ID, then list all open and pending tickets assigned to me.
```

Kiro will call `get_me` to retrieve your agent ID, then `list_tickets` with
`query: "agent_id:<your-id> AND (status:2 OR status:3)"`.

---

### Workflow 2: Investigate a ticket

Get full context on a specific ticket including the conversation history.

**Example:**
```
Show me ticket #12345 including all comments.
```

Kiro calls `get_ticket` and `get_ticket_comments` in sequence.

---

### Workflow 3: Update ticket status

Mark a ticket as resolved or change its priority.

**Example:**
```
Set ticket #12345 to status Resolved (status code 4).
```

Kiro calls `update_ticket` with `{ status: 4 }`.

---

### Workflow 4: Add an internal note

Document your progress without notifying the requester.

**Example:**
```
Add a private note to ticket #12345: "Investigated – root cause is the expired SSL cert. Fix scheduled for tonight."
```

Kiro calls `add_ticket_note` with `private: true`.

---

### Workflow 5: Create a ticket

Raise a new incident or service request.

**Example:**
```
Create a ticket with subject "VPN not connecting for user john@example.com", 
priority High, assign to group 1234.
```

Kiro calls `create_ticket` with the appropriate fields.

## Tool Reference

| Tool | Description |
|---|---|
| `list_tickets` | List tickets with filter query or preset |
| `get_ticket` | Get single ticket details |
| `get_ticket_comments` | Get all conversations for a ticket |
| `create_ticket` | Create a new ticket |
| `update_ticket` | Update ticket fields |
| `add_ticket_note` | Add private note or public reply |
| `get_me` | Get authenticated agent profile |
| `list_agents` | List agents (filter by email) |

### Freshservice Status Codes

| Code | Status |
|---|---|
| 2 | Open |
| 3 | Pending |
| 4 | Resolved |
| 5 | Closed |

### Priority Codes

| Code | Priority |
|---|---|
| 1 | Low |
| 2 | Medium |
| 3 | High |
| 4 | Urgent |

## Troubleshooting

### MCP server won't start

**Problem:** Server doesn't appear in Kiro's tool list.

**Solutions:**
1. Verify Node.js 18+: `node --version`
2. Check environment variables are set correctly in `mcp.json`
3. Test manually: `FRESHSERVICE_DOMAIN=yourcompany.freshservice.com FRESHSERVICE_API_KEY=yourkey npx freshservice-mcp`
4. Restart Kiro (reload window) after config changes

### Authentication errors (401)

**Cause:** Wrong or expired API key, or incorrect domain.

**Solution:**
1. Verify the domain — it should be `yourcompany.freshservice.com` without `https://`
2. Regenerate your API key in Freshservice Profile Settings
3. Update `FRESHSERVICE_API_KEY` in your mcp.json

### Filter queries return 500

**Cause:** Freshservice filter API requires the query wrapped in double quotes internally.
This is handled automatically by the server — you don't need to add quotes yourself.

**Example of correct usage:**
```
Query: agent_id:123 AND status:2
```
(Not: `"agent_id:123 AND status:2"`)

## Best Practices

- Use `get_me` first to get your agent ID when you need to filter your own tickets
- Prefer `query` filtering over fetching all tickets and filtering client-side
- Use `FRESHSERVICE_READONLY=true` in shared environments to prevent accidental writes
- Keep your API key in environment variables, never hardcode it
- Private notes (`private: true`) are not visible to requesters — use them for internal communication
