/**
 * Freshservice API client.
 * Zero-dependency HTTP wrapper using native fetch (Node.js 18+).
 * Auth: HTTP Basic with "<API_KEY>:X" (Freshservice convention).
 */

export interface FreshserviceConfig {
  domain: string; // e.g. "yourcompany.freshservice.com"
  apiKey: string;
}

export interface FsTicket {
  id: number;
  subject: string;
  description?: string;
  description_text?: string;
  status: number;
  priority: number;
  type?: string;
  source?: number;
  requester_id?: number;
  responder_id?: number;
  group_id?: number;
  email?: string;
  cc_emails?: string[];
  tags?: string[];
  created_at: string;
  updated_at: string;
  due_by?: string;
  requester?: { name?: string; email?: string; id?: number };
  [key: string]: unknown;
}

export interface FsConversation {
  id: number;
  body?: string;
  body_text?: string;
  private: boolean;
  user_id?: number;
  from_email?: string;
  created_at: string;
  [key: string]: unknown;
}

export interface FsAgent {
  id: number;
  first_name?: string;
  last_name?: string;
  email: string;
  group_ids?: number[];
  [key: string]: unknown;
}

export interface FsTicketStatus {
  [id: string]: string;
}

// ---------------------------------------------------------------------------
// HTTP primitives
// ---------------------------------------------------------------------------

function basicAuth(apiKey: string): string {
  return "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");
}

async function fsRequest<T>(
  config: FreshserviceConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string> = {},
  body?: unknown
): Promise<T> {
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
    // Keep enough of the body to carry Freshservice's field-level validation
    // details, e.g. the allowed values listed on a 400 for `category`.
    throw new Error(
      `Freshservice API ${method} ${path} → ${res.status}: ${text.slice(0, 2000)}`
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

async function fsGet<T>(
  config: FreshserviceConfig,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  return fsRequest<T>(config, "GET", path, params);
}

async function fsPost<T>(
  config: FreshserviceConfig,
  path: string,
  body: unknown
): Promise<T> {
  return fsRequest<T>(config, "POST", path, {}, body);
}

async function fsPut<T>(
  config: FreshserviceConfig,
  path: string,
  body: unknown
): Promise<T> {
  return fsRequest<T>(config, "PUT", path, {}, body);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  if (!html) return "";
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

// ---------------------------------------------------------------------------
// Ticket API
// ---------------------------------------------------------------------------

export interface ListTicketsOptions {
  /** Custom filter query, e.g. "agent_id:123 AND status:2" */
  query?: string;
  /** Standard filter presets supported by the list endpoint */
  filter?: "new_and_my_open" | "watching" | "spam" | "deleted";
  /** Include extra fields: requester, stats, etc. */
  include?: string;
  /** Max tickets to return (default 100) */
  limit?: number;
  /** Page number (1-based) */
  page?: number;
}

export interface CreateTicketPayload {
  subject: string;
  description?: string;
  email?: string;
  requester_id?: number;
  priority?: 1 | 2 | 3 | 4;
  status?: number;
  source?: number;
  group_id?: number;
  responder_id?: number;
  tags?: string[];
  cc_emails?: string[];
  type?: string;
  category?: string;
  sub_category?: string;
  [key: string]: unknown;
}

export interface UpdateTicketPayload {
  subject?: string;
  description?: string;
  priority?: 1 | 2 | 3 | 4;
  status?: number;
  group_id?: number;
  responder_id?: number;
  tags?: string[];
  type?: string;
  [key: string]: unknown;
}

export async function listTickets(
  config: FreshserviceConfig,
  options: ListTicketsOptions = {}
): Promise<FsTicket[]> {
  const limit = options.limit ?? 100;
  const tickets: FsTicket[] = [];

  const useFilter = !!options.query;
  const endpoint = useFilter ? "tickets/filter" : "tickets";
  const params: Record<string, string> = {
    per_page: "100",
  };

  if (useFilter) {
    // Freshservice filter API requires the query wrapped in double quotes
    params.query = `"${options.query}"`;
  } else {
    if (options.filter) params.filter = options.filter;
    if (options.include) params.include = options.include;
  }

  let page = options.page ?? 1;

  while (tickets.length < limit) {
    params.page = String(page);
    const data = await fsGet<{ tickets: FsTicket[] }>(config, endpoint, params);
    const batch = data.tickets ?? [];
    if (batch.length === 0) break;
    for (const t of batch) {
      tickets.push(t);
      if (tickets.length >= limit) break;
    }
    if (batch.length < 100) break;
    page++;
  }

  return tickets;
}

export async function getTicket(
  config: FreshserviceConfig,
  ticketId: number,
  include = "requester,stats"
): Promise<FsTicket> {
  const data = await fsGet<{ ticket: FsTicket }>(config, `tickets/${ticketId}`, {
    include,
  });
  return data.ticket;
}

export async function createTicket(
  config: FreshserviceConfig,
  payload: CreateTicketPayload
): Promise<FsTicket> {
  const data = await fsPost<{ ticket: FsTicket }>(config, "tickets", payload);
  return data.ticket;
}

export async function updateTicket(
  config: FreshserviceConfig,
  ticketId: number,
  payload: UpdateTicketPayload
): Promise<FsTicket> {
  const data = await fsPut<{ ticket: FsTicket }>(
    config,
    `tickets/${ticketId}`,
    payload
  );
  return data.ticket;
}

// ---------------------------------------------------------------------------
// Conversations (comments)
// ---------------------------------------------------------------------------

export async function getTicketConversations(
  config: FreshserviceConfig,
  ticketId: number
): Promise<FsConversation[]> {
  const data = await fsGet<{ conversations: FsConversation[] }>(
    config,
    `tickets/${ticketId}/conversations`
  );
  return data.conversations ?? [];
}

export interface AddNotePayload {
  body: string;
  /** true = private note, false = public reply */
  private?: boolean;
  notify_emails?: string[];
}

export async function addTicketNote(
  config: FreshserviceConfig,
  ticketId: number,
  payload: AddNotePayload
): Promise<FsConversation> {
  const data = await fsPost<{ conversation: FsConversation }>(
    config,
    `tickets/${ticketId}/notes`,
    payload
  );
  return data.conversation;
}

export async function replyToTicket(
  config: FreshserviceConfig,
  ticketId: number,
  payload: { body: string; cc_emails?: string[] }
): Promise<FsConversation> {
  const data = await fsPost<{ conversation: FsConversation }>(
    config,
    `tickets/${ticketId}/reply`,
    payload
  );
  return data.conversation;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function getMe(config: FreshserviceConfig): Promise<FsAgent> {
  const data = await fsGet<{ agent: FsAgent }>(config, "agents/me");
  return data.agent;
}

export async function listAgents(
  config: FreshserviceConfig,
  options: { email?: string; per_page?: number } = {}
): Promise<FsAgent[]> {
  const params: Record<string, string> = {
    per_page: String(options.per_page ?? 50),
  };
  if (options.email) params.email = options.email;
  const data = await fsGet<{ agents: FsAgent[] }>(config, "agents", params);
  return data.agents ?? [];
}

// ---------------------------------------------------------------------------
// Ticket statuses
// ---------------------------------------------------------------------------

/** Default status map as fallback if the API endpoint is unavailable */
export const DEFAULT_STATUS_MAP: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
};

export const PRIORITY_MAP: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export async function getTicketStatuses(
  config: FreshserviceConfig
): Promise<Record<number, string>> {
  try {
    const data = await fsGet<Record<string, string>>(
      config,
      "ticket_statuses"
    );
    const map: Record<number, string> = {};
    for (const [id, label] of Object.entries(data)) {
      const n = Number(id);
      if (!isNaN(n) && label) map[n] = label;
    }
    if (Object.keys(map).length > 0) return map;
  } catch {
    // fall through to default
  }
  return { ...DEFAULT_STATUS_MAP };
}
