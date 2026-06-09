/**
 * Freshservice API client.
 * Zero-dependency HTTP wrapper using native fetch (Node.js 18+).
 * Auth: HTTP Basic with "<API_KEY>:X" (Freshservice convention).
 */
// ---------------------------------------------------------------------------
// HTTP primitives
// ---------------------------------------------------------------------------
function basicAuth(apiKey) {
    return "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");
}
async function fsRequest(config, method, path, params = {}, body) {
    const url = new URL(`https://${config.domain}/api/v2/${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        method,
        headers: {
            Authorization: basicAuth(config.apiKey),
            "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Freshservice API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    // 204 No Content
    if (res.status === 204)
        return undefined;
    return res.json();
}
async function fsGet(config, path, params = {}) {
    return fsRequest(config, "GET", path, params);
}
async function fsPost(config, path, body) {
    return fsRequest(config, "POST", path, {}, body);
}
async function fsPut(config, path, body) {
    return fsRequest(config, "PUT", path, {}, body);
}
// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
export function stripHtml(html) {
    if (!html)
        return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li>/gi, "• ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
export async function listTickets(config, options = {}) {
    const limit = options.limit ?? 100;
    const tickets = [];
    const useFilter = !!options.query;
    const endpoint = useFilter ? "tickets/filter" : "tickets";
    const params = {
        per_page: "100",
    };
    if (useFilter) {
        // Freshservice filter API requires the query wrapped in double quotes
        params.query = `"${options.query}"`;
    }
    else {
        if (options.filter)
            params.filter = options.filter;
        if (options.include)
            params.include = options.include;
    }
    let page = options.page ?? 1;
    while (tickets.length < limit) {
        params.page = String(page);
        const data = await fsGet(config, endpoint, params);
        const batch = data.tickets ?? [];
        if (batch.length === 0)
            break;
        for (const t of batch) {
            tickets.push(t);
            if (tickets.length >= limit)
                break;
        }
        if (batch.length < 100)
            break;
        page++;
    }
    return tickets;
}
export async function getTicket(config, ticketId, include = "requester,stats") {
    const data = await fsGet(config, `tickets/${ticketId}`, {
        include,
    });
    return data.ticket;
}
export async function createTicket(config, payload) {
    const data = await fsPost(config, "tickets", payload);
    return data.ticket;
}
export async function updateTicket(config, ticketId, payload) {
    const data = await fsPut(config, `tickets/${ticketId}`, payload);
    return data.ticket;
}
// ---------------------------------------------------------------------------
// Conversations (comments)
// ---------------------------------------------------------------------------
export async function getTicketConversations(config, ticketId) {
    const data = await fsGet(config, `tickets/${ticketId}/conversations`);
    return data.conversations ?? [];
}
export async function addTicketNote(config, ticketId, payload) {
    const data = await fsPost(config, `tickets/${ticketId}/notes`, payload);
    return data.conversation;
}
export async function replyToTicket(config, ticketId, payload) {
    const data = await fsPost(config, `tickets/${ticketId}/reply`, payload);
    return data.conversation;
}
// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export async function getMe(config) {
    const data = await fsGet(config, "agents/me");
    return data.agent;
}
export async function listAgents(config, options = {}) {
    const params = {
        per_page: String(options.per_page ?? 50),
    };
    if (options.email)
        params.email = options.email;
    const data = await fsGet(config, "agents", params);
    return data.agents ?? [];
}
// ---------------------------------------------------------------------------
// Ticket statuses
// ---------------------------------------------------------------------------
/** Default status map as fallback if the API endpoint is unavailable */
export const DEFAULT_STATUS_MAP = {
    2: "Open",
    3: "Pending",
    4: "Resolved",
    5: "Closed",
};
export const PRIORITY_MAP = {
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Urgent",
};
export async function getTicketStatuses(config) {
    try {
        const data = await fsGet(config, "ticket_statuses");
        const map = {};
        for (const [id, label] of Object.entries(data)) {
            const n = Number(id);
            if (!isNaN(n) && label)
                map[n] = label;
        }
        if (Object.keys(map).length > 0)
            return map;
    }
    catch {
        // fall through to default
    }
    return { ...DEFAULT_STATUS_MAP };
}
//# sourceMappingURL=freshservice-client.js.map