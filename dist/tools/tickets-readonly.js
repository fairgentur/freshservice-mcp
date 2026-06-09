/**
 * Read-only subset of ticket tools.
 * Registered when FRESHSERVICE_READONLY=true is set.
 */
import { z } from "zod";
import { listTickets, getTicket, getTicketConversations, stripHtml, DEFAULT_STATUS_MAP, PRIORITY_MAP, } from "../freshservice-client.js";
function statusLabel(status) {
    return DEFAULT_STATUS_MAP[status] ?? String(status);
}
function priorityLabel(priority) {
    return PRIORITY_MAP[priority] ?? String(priority);
}
function normalizeTicket(t) {
    return {
        id: t.id,
        subject: t.subject,
        status: statusLabel(t.status),
        priority: priorityLabel(t.priority),
        type: t.type ?? null,
        requester: t.requester?.name ?? t.requester?.email ?? t.requester_id ?? null,
        responder_id: t.responder_id ?? null,
        group_id: t.group_id ?? null,
        tags: t.tags ?? [],
        created_at: t.created_at,
        updated_at: t.updated_at,
        due_by: t.due_by ?? null,
        url: `https://${process.env.FRESHSERVICE_DOMAIN}/helpdesk/tickets/${t.id}`,
    };
}
export function registerReadOnlyTicketTools(server, config) {
    server.registerTool("list_tickets", {
        title: "List Tickets",
        description: "List Freshservice tickets. Use `query` for advanced filtering " +
            "(e.g. \"agent_id:123 AND status:2\") or `filter` for built-in presets.",
        inputSchema: z.object({
            query: z.string().optional().describe("Filter query, e.g. \"agent_id:123 AND status:2\""),
            filter: z
                .enum(["new_and_my_open", "watching", "spam", "deleted"])
                .optional(),
            include: z.string().optional(),
            limit: z.number().int().min(1).max(500).optional(),
        }),
    }, async ({ query, filter, include, limit }) => {
        const tickets = await listTickets(config, { query, filter, include, limit });
        if (tickets.length === 0) {
            return { content: [{ type: "text", text: "No tickets found." }] };
        }
        const normalized = tickets.map((t) => normalizeTicket(t));
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ count: normalized.length, tickets: normalized }, null, 2),
                },
            ],
        };
    });
    server.registerTool("get_ticket", {
        title: "Get Ticket",
        description: "Retrieve full details of a single Freshservice ticket by ID.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive(),
            include: z.string().optional(),
        }),
    }, async ({ ticket_id, include }) => {
        const ticket = await getTicket(config, ticket_id, include ?? "requester,stats");
        const description = ticket.description_text?.trim() ?? stripHtml(ticket.description ?? "");
        const result = { ...normalizeTicket(ticket), description };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    server.registerTool("get_ticket_comments", {
        title: "Get Ticket Comments",
        description: "Retrieve all conversations (replies and notes) for a Freshservice ticket.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive(),
        }),
    }, async ({ ticket_id }) => {
        const conversations = await getTicketConversations(config, ticket_id);
        if (conversations.length === 0) {
            return { content: [{ type: "text", text: "No comments found." }] };
        }
        const normalized = conversations.map((c) => ({
            id: c.id,
            private: c.private,
            from_email: c.from_email ?? null,
            user_id: c.user_id ?? null,
            created_at: c.created_at,
            body: c.body_text?.trim() ?? stripHtml(c.body ?? ""),
        }));
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ ticket_id, count: normalized.length, conversations: normalized }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=tickets-readonly.js.map