---
inclusion: manual
---

# Freshservice Ticket Workflows

This guide covers common patterns for working with Freshservice tickets through the MCP tools.

## Filtering tickets

The `list_tickets` tool supports two filtering modes:

### Built-in presets (`filter` parameter)
```
filter: "new_and_my_open"   → new tickets + tickets assigned to me
filter: "watching"           → tickets I am watching
filter: "spam"               → spam tickets
filter: "deleted"            → deleted tickets
```

### Custom filter queries (`query` parameter)
Use Freshservice's filter query syntax. Fields can be combined with `AND` / `OR`.

**Common examples:**
```
agent_id:123                              → assigned to specific agent
status:2                                  → open tickets
status:2 OR status:3                      → open or pending
agent_id:123 AND status:2                 → open tickets assigned to agent 123
priority:3                               → high priority
group_id:456                             → assigned to group 456
created_at:>'2024-01-01'                 → created after date
due_by:<'2024-12-31'                     → due before date
tag:'production'                         → tagged with "production"
```

**Status codes reference:**
- `2` = Open
- `3` = Pending
- `4` = Resolved
- `5` = Closed

**Priority codes reference:**
- `1` = Low
- `2` = Medium
- `3` = High
- `4` = Urgent

## Typical agent workflow

```
1. get_me                         → get my agent ID
2. list_tickets query="agent_id:<id> AND (status:2 OR status:3)"
3. get_ticket ticket_id=<id>     → inspect a specific ticket
4. get_ticket_comments ticket_id=<id>  → read the conversation
5. add_ticket_note ticket_id=<id> body="..." private=true   → add internal note
6. update_ticket ticket_id=<id> status=4   → resolve the ticket
```

## Creating tickets

Minimum required fields:
- `subject` (required)
- `email` OR `requester_id` (one of these required)

Useful optional fields:
- `priority` (1-4)
- `status` (default: 2 = Open)
- `type` (e.g. "Incident", "Service Request")
- `group_id` for routing to a team
- `responder_id` for direct agent assignment
- `tags` for categorization

## Notes vs Replies

`add_ticket_note` has two modes controlled by `private`:

- `private: true` (default) → **internal note**, only visible to agents
- `private: false` → **public reply**, sent to the requester by email

## Pagination and limits

`list_tickets` defaults to 100 tickets per call. Use `limit` to adjust (max 500).
For very large queries, use specific filters to keep result sets manageable.
