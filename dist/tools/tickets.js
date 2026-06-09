/**
 * MCP tool registrations for Freshservice ticket operations.
 */
import { z } from "zod";
import { listTickets, getTicket, createTicket, updateTicket, getTicketConversations, addTicketNote, replyToTicket, stripHtml, DEFAULT_STATUS_MAP, PRIORITY_MAP, } from "../freshservice-client.js";
function statusLabel(status, statusMap) {
    return statusMap[status] ?? String(status);
}
function priorityLabel(priority) {
    return PRIORITY_MAP[priority] ?? String(priority);
}
function normalizeTicket(t, statusMap) {
    return {
        id: t.id,
        subject: t.subject,
        status: statusLabel(t.status, statusMap),
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
export function registerTicketTools(server, config) {
    // -------------------------------------------------------------------------
    // list_tickets
    // -------------------------------------------------------------------------
    server.registerTool("list_tickets", {
        title: "List Tickets",
        description: "List Freshservice tickets. Use `query` for advanced filtering " +
            "(e.g. \"agent_id:123 AND status:2\") or `filter` for built-in presets. " +
            "Returns id, subject, status, priority, type, requester, dates and URL.",
        inputSchema: z.object({
            query: z
                .string()
                .optional()
                .describe("Freshservice filter query, e.g. \"agent_id:123 AND status:2 AND priority:3\". " +
                "Supports all fields documented at https://api.freshservice.com/#filter_tickets"),
            filter: z
                .enum(["new_and_my_open", "watching", "spam", "deleted"])
                .optional()
                .describe("Built-in filter preset (used when `query` is not provided)"),
            include: z
                .string()
                .optional()
                .describe("Comma-separated extra fields: requester, stats, conversations"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe("Maximum number of tickets to return (default: 100)"),
        }),
    }, async ({ query, filter, include, limit }) => {
        const tickets = await listTickets(config, { query, filter, include, limit });
        if (tickets.length === 0) {
            return { content: [{ type: "text", text: "No tickets found." }] };
        }
        const normalized = tickets.map((t) => normalizeTicket(t, DEFAULT_STATUS_MAP));
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ count: normalized.length, tickets: normalized }, null, 2),
                },
            ],
        };
    });
    // -------------------------------------------------------------------------
    // get_ticket
    // -------------------------------------------------------------------------
    server.registerTool("get_ticket", {
        title: "Get Ticket",
        description: "Retrieve full details of a single Freshservice ticket by ID, " +
            "including description, status, priority, requester and stats.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive().describe("Freshservice ticket ID"),
            include: z
                .string()
                .optional()
                .describe("Comma-separated extra includes: requester, stats, conversations, assets, problem, change. " +
                "Default: requester,stats"),
        }),
    }, async ({ ticket_id, include }) => {
        const ticket = await getTicket(config, ticket_id, include ?? "requester,stats");
        const description = ticket.description_text?.trim() ??
            stripHtml(ticket.description ?? "");
        const result = {
            ...normalizeTicket(ticket, DEFAULT_STATUS_MAP),
            description,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    // -------------------------------------------------------------------------
    // get_ticket_comments
    // -------------------------------------------------------------------------
    server.registerTool("get_ticket_comments", {
        title: "Get Ticket Comments",
        description: "Retrieve all conversations (replies and notes) for a Freshservice ticket.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive().describe("Freshservice ticket ID"),
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
    // -------------------------------------------------------------------------
    // create_ticket
    // -------------------------------------------------------------------------
    server.registerTool("create_ticket", {
        title: "Create Ticket",
        description: "Create a new Freshservice ticket. Either `email` or `requester_id` must be provided.",
        inputSchema: z.object({
            subject: z.string().min(1).describe("Ticket subject / title"),
            description: z
                .string()
                .optional()
                .describe("Ticket description (HTML or plain text)"),
            email: z
                .string()
                .email()
                .optional()
                .describe("Requester email address"),
            requester_id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Requester agent/user ID"),
            priority: z
                .enum(["1", "2", "3", "4"])
                .optional()
                .describe("Priority: 1=Low, 2=Medium, 3=High, 4=Urgent (default: 2)"),
            status: z
                .number()
                .int()
                .optional()
                .describe("Status code (default: 2 = Open)"),
            group_id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Agent group ID to assign to"),
            responder_id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Agent ID to assign to"),
            tags: z.array(z.string()).optional().describe("List of tags"),
            type: z.string().optional().describe("Ticket type, e.g. Incident, Service Request"),
            cc_emails: z
                .array(z.string().email())
                .optional()
                .describe("CC email addresses"),
        }),
    }, async ({ subject, description, email, requester_id, priority, status, group_id, responder_id, tags, type, cc_emails }) => {
        const ticket = await createTicket(config, {
            subject,
            description,
            email,
            requester_id,
            priority: priority ? Number(priority) : 2,
            status: status ?? 2,
            group_id,
            responder_id,
            tags,
            type,
            cc_emails,
        });
        const result = normalizeTicket(ticket, DEFAULT_STATUS_MAP);
        return {
            content: [
                {
                    type: "text",
                    text: `Ticket #${ticket.id} created.\n\n${JSON.stringify(result, null, 2)}`,
                },
            ],
        };
    });
    // -------------------------------------------------------------------------
    // update_ticket
    // -------------------------------------------------------------------------
    server.registerTool("update_ticket", {
        title: "Update Ticket",
        description: "Update fields of an existing Freshservice ticket. Only provided fields are changed.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive().describe("Freshservice ticket ID"),
            subject: z.string().optional().describe("New subject"),
            description: z.string().optional().describe("New description"),
            priority: z
                .enum(["1", "2", "3", "4"])
                .optional()
                .describe("Priority: 1=Low, 2=Medium, 3=High, 4=Urgent"),
            status: z
                .number()
                .int()
                .optional()
                .describe("New status code (e.g. 2=Open, 3=Pending, 4=Resolved, 5=Closed)"),
            group_id: z.number().int().positive().optional().describe("Agent group ID"),
            responder_id: z.number().int().positive().optional().describe("Assigned agent ID"),
            tags: z.array(z.string()).optional().describe("New tag list (replaces existing)"),
            type: z.string().optional().describe("Ticket type"),
        }),
    }, async ({ ticket_id, subject, description, priority, status, group_id, responder_id, tags, type }) => {
        const payload = {};
        if (subject !== undefined)
            payload.subject = subject;
        if (description !== undefined)
            payload.description = description;
        if (priority !== undefined)
            payload.priority = Number(priority);
        if (status !== undefined)
            payload.status = status;
        if (group_id !== undefined)
            payload.group_id = group_id;
        if (responder_id !== undefined)
            payload.responder_id = responder_id;
        if (tags !== undefined)
            payload.tags = tags;
        if (type !== undefined)
            payload.type = type;
        const ticket = await updateTicket(config, ticket_id, payload);
        const result = normalizeTicket(ticket, DEFAULT_STATUS_MAP);
        return {
            content: [
                {
                    type: "text",
                    text: `Ticket #${ticket_id} updated.\n\n${JSON.stringify(result, null, 2)}`,
                },
            ],
        };
    });
    // -------------------------------------------------------------------------
    // add_ticket_note
    // -------------------------------------------------------------------------
    server.registerTool("add_ticket_note", {
        title: "Add Ticket Note",
        description: "Add a private note or public reply to a Freshservice ticket.",
        inputSchema: z.object({
            ticket_id: z.number().int().positive().describe("Freshservice ticket ID"),
            body: z.string().min(1).describe("Note or reply body (HTML allowed)"),
            private: z
                .boolean()
                .optional()
                .describe("true = private note (default), false = public reply visible to requester"),
            notify_emails: z
                .array(z.string().email())
                .optional()
                .describe("Additional email addresses to notify"),
        }),
    }, async ({ ticket_id, body, private: isPrivate, notify_emails }) => {
        // Use reply endpoint for public messages, notes endpoint for private
        let conversation;
        if (isPrivate === false) {
            conversation = await replyToTicket(config, ticket_id, {
                body,
                cc_emails: notify_emails,
            });
        }
        else {
            conversation = await addTicketNote(config, ticket_id, {
                body,
                private: true,
                notify_emails,
            });
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Note added to ticket #${ticket_id} (conversation id: ${conversation.id}).`,
                },
            ],
        };
    });
}
//# sourceMappingURL=tickets.js.map