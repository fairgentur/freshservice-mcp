/**
 * Freshservice API client.
 * Zero-dependency HTTP wrapper using native fetch (Node.js 22+).
 * Auth: HTTP Basic with "<API_KEY>:X" (Freshservice convention).
 */

export interface FreshserviceConfig {
  domain: string; // e.g. "yourcompany.freshservice.com"
  apiKey: string;
}

export interface FsAttachment {
  id?: number;
  name: string;
  content_type: string;
  size: number;
  attachment_url?: string;
  canonical_url?: string;
  canonical_path?: string;
  has_access?: boolean;
  created_at?: string;
  updated_at?: string;
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
  /** Instance-specific fields, keyed by their internal name (e.g. "cf_release"). */
  custom_fields?: Record<string, unknown>;
  attachments?: FsAttachment[];
  [key: string]: unknown;
}

/** Value accepted for a single custom field on ticket or catalog request writes. */
export type CustomFieldValue = string | number | boolean | null;

/** A ticket form field as returned by GET /ticket_form_fields. */
export interface FsTicketField {
  id: number;
  name: string;
  label: string;
  description?: string;
  field_type: string;
  default_field: boolean;
  required?: boolean;
  required_for_agents?: boolean;
  required_for_closure?: boolean;
  choices?: unknown[];
  nested_fields?: unknown[];
  [key: string]: unknown;
}

/** A form field in a service catalog item's `custom_fields` array. */
export interface FsCatalogItemField {
  id?: number | string;
  name: string;
  label: string;
  description?: string;
  field_type: string;
  required?: boolean;
  choices?: unknown[];
  nested_fields?: unknown[];
  [key: string]: unknown;
}

export interface FsServiceCatalogItem {
  id: number;
  display_id: number;
  name: string;
  category_id?: number | null;
  short_description?: string | null;
  description?: string | null;
  visibility?: number;
  allow_quantity?: boolean;
  custom_fields?: FsCatalogItemField[];
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
  attachments?: FsAttachment[];
  [key: string]: unknown;
}

export interface FsRequestedItem {
  id: number;
  service_item_id?: number;
  service_item_name?: string;
  attachments?: FsAttachment[];
  custom_fields?: Record<string, unknown>;
}

export interface FsChange {
  id: number;
  subject: string;
  description?: string;
  description_text?: string;
  status: 1 | 2 | 3 | 4 | 5 | 6;
  priority: 1 | 2 | 3 | 4;
  impact: 1 | 2 | 3;
  risk: 1 | 2 | 3 | 4;
  change_type: 1 | 2 | 3 | 4;
  requester_id: number;
  group_id?: number;
  agent_id?: number;
  planned_start_date?: string;
  planned_end_date?: string;
  planning_fields?: {
    change_plan?: string;
    backout_plan?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface FsChangeNote {
  id: number;
  body?: string;
  body_text?: string;
  user_id?: number;
  notify_emails?: string[] | null;
  created_at: string;
  updated_at: string;
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
  custom_fields?: Record<string, CustomFieldValue>;
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
  custom_fields?: Record<string, CustomFieldValue>;
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
// Ticket form fields
// ---------------------------------------------------------------------------

export async function listTicketFields(
  config: FreshserviceConfig
): Promise<FsTicketField[]> {
  const data = await fsGet<{ ticket_fields: FsTicketField[] }>(
    config,
    "ticket_form_fields"
  );
  return data.ticket_fields ?? [];
}

// ---------------------------------------------------------------------------
// Service catalog
// ---------------------------------------------------------------------------

export interface ListServiceCatalogItemsOptions {
  category_id?: number;
  /** Case-insensitive name filter, applied locally across pages. */
  search?: string;
  /** Maximum number of matching items to return (default 100). */
  limit?: number;
  /** First page to read (1-based). */
  page?: number;
}

/** Only documented JSON inputs for the place_request endpoint. */
export interface PlaceRequestPayload {
  quantity?: number;
  email?: string;
  requested_for?: string;
  custom_fields?: Record<string, CustomFieldValue>;
}

export async function listServiceCatalogItems(
  config: FreshserviceConfig,
  options: ListServiceCatalogItemsOptions = {}
): Promise<FsServiceCatalogItem[]> {
  const limit = options.limit ?? 100;
  const items: FsServiceCatalogItem[] = [];
  // Unlike ticket lists, this endpoint allows at most 30 items per page.
  const perPage = 30;
  const params: Record<string, string> = { per_page: String(perPage) };
  if (options.category_id !== undefined) params.category_id = String(options.category_id);
  const search = options.search?.trim().toLowerCase();

  for (let page = options.page ?? 1; items.length < limit; page++) {
    params.page = String(page);
    const data = await fsGet<{ service_items: FsServiceCatalogItem[] }>(
      config,
      "service_catalog/items",
      params
    );
    const batch = data.service_items ?? [];
    for (const item of batch) {
      if (search && !item.name.toLowerCase().includes(search)) continue;
      items.push(item);
      if (items.length >= limit) break;
    }
    if (batch.length < perPage) break;
  }
  return items;
}

export async function getServiceCatalogItem(
  config: FreshserviceConfig,
  displayId: number
): Promise<FsServiceCatalogItem> {
  const data = await fsGet<{ service_item: FsServiceCatalogItem }>(
    config,
    `service_catalog/items/${displayId}`
  );
  return data.service_item;
}

export async function placeServiceRequest(
  config: FreshserviceConfig,
  displayId: number,
  payload: PlaceRequestPayload = {}
): Promise<FsTicket> {
  const data = await fsPost<{ service_request: FsTicket }>(
    config,
    `service_catalog/items/${displayId}/place_request`,
    { ...payload, quantity: payload.quantity ?? 1 }
  );
  return data.service_request;
}

// ---------------------------------------------------------------------------
// Conversations (comments)
// ---------------------------------------------------------------------------

export async function getTicketConversations(
  config: FreshserviceConfig,
  ticketId: number
): Promise<FsConversation[]> {
  const conversations: FsConversation[] = [];
  for (let page = 1; ; page++) {
    const data = await fsGet<{ conversations: FsConversation[] }>(
      config,
      `tickets/${ticketId}/conversations`,
      { per_page: "100", page: String(page) }
    );
    const batch = data.conversations ?? [];
    conversations.push(...batch);
    if (batch.length < 100) return conversations;
  }
}

/** Service-request form files are not included in the ticket attachment array. */
export async function getTicketRequestedItems(
  config: FreshserviceConfig,
  ticketId: number
): Promise<FsRequestedItem[]> {
  const items: FsRequestedItem[] = [];
  for (let page = 1; ; page++) {
    const data = await fsGet<{ requested_items: FsRequestedItem[] }>(
      config,
      `tickets/${ticketId}/requested_items`,
      { per_page: "100", page: String(page) }
    );
    const batch = data.requested_items ?? [];
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

// ---------------------------------------------------------------------------
// Attachment downloads (binary, rather than the JSON HTTP primitives above)
// ---------------------------------------------------------------------------

/** Bound both memory use and the size of the embedded MCP resource. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function downloadAttachment(
  config: FreshserviceConfig,
  attachmentId: number
): Promise<{ data: Buffer; contentType: string }> {
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
    throw new Error("attachment_id must be a positive safe integer.");
  }

  const endpoint = new URL(`https://${config.domain}/api/v2/attachments/${attachmentId}`);
  let url = endpoint;
  let authorization: string | undefined = basicAuth(config.apiKey);
  const signal = AbortSignal.timeout(30_000);

  for (let redirects = 0; ; redirects++) {
    const res = await fetch(url.toString(), {
      headers: authorization ? { Authorization: authorization } : {},
      redirect: "manual",
      signal,
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get("location");
      if (!location || redirects >= 5) {
        throw new Error("Attachment download failed: missing redirect location or too many redirects.");
      }
      const next = new URL(location, url);
      if (next.protocol !== "https:" || next.username || next.password) {
        throw new Error("Attachment download redirects must use HTTPS without URL credentials.");
      }
      // Freshservice may redirect to signed CDN URLs. Once we leave the API
      // origin, never forward or reintroduce the agent's API key.
      if (next.origin !== endpoint.origin) authorization = undefined;
      url = next;
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Freshservice attachment ${attachmentId} download failed: HTTP ${res.status}`);
    }
    if (Number(res.headers.get("content-length")) > MAX_ATTACHMENT_BYTES) {
      await res.body?.cancel();
      throw new Error("Attachment exceeds the 10 MiB download limit.");
    }

    const reader = res.body?.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_ATTACHMENT_BYTES) {
            await reader.cancel();
            throw new Error("Attachment exceeds the 10 MiB download limit.");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }
    return {
      data: Buffer.concat(chunks, size),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
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
// Change API
// ---------------------------------------------------------------------------

export interface ListChangesOptions {
  query?: string;
  view?: string;
  updated_since?: string;
  workspace_id?: number;
  order_by?: string;
  order_type?: "asc" | "desc";
  limit?: number;
  page?: number;
}

export interface CreateChangePayload {
  subject: string;
  description: string;
  requester_id: number;
  priority: 1 | 2 | 3 | 4;
  status: 1 | 2 | 3 | 4 | 5 | 6;
  impact: 1 | 2 | 3;
  risk: 1 | 2 | 3 | 4;
  change_type: 1 | 2 | 3 | 4;
  planned_start_date: string;
  planned_end_date: string;
  change_plan?: string;
  group_id?: number;
  agent_id?: number;
  [key: string]: unknown;
}

export interface UpdateChangePayload {
  subject?: string;
  description?: string;
  requester_id?: number;
  priority?: 1 | 2 | 3 | 4;
  status?: 1 | 2 | 3 | 4 | 5 | 6;
  impact?: 1 | 2 | 3;
  risk?: 1 | 2 | 3 | 4;
  change_type?: 1 | 2 | 3 | 4;
  planned_start_date?: string;
  planned_end_date?: string;
  change_plan?: string;
  group_id?: number;
  agent_id?: number;
  [key: string]: unknown;
}

function withChangePlan<T extends { change_plan?: string }>(payload: T): Omit<T, "change_plan"> & {
  planning_fields?: { change_plan: string };
} {
  const { change_plan, ...rest } = payload;
  return change_plan === undefined
    ? rest
    : { ...rest, planning_fields: { change_plan } };
}

export async function listChanges(
  config: FreshserviceConfig,
  options: ListChangesOptions = {}
): Promise<FsChange[]> {
  const limit = options.limit ?? 100;
  const changes: FsChange[] = [];
  const params: Record<string, string> = { per_page: "100" };

  if (options.query) params.query = `"${options.query}"`;
  if (options.view) params.view = options.view;
  if (options.updated_since) params.updated_since = options.updated_since;
  if (options.workspace_id !== undefined) params.workspace_id = String(options.workspace_id);
  if (options.order_by) params.order_by = options.order_by;
  if (options.order_type) params.order_type = options.order_type;

  let page = options.page ?? 1;
  while (changes.length < limit) {
    params.page = String(page);
    const data = await fsGet<{ changes: FsChange[] }>(config, "changes", params);
    const batch = data.changes ?? [];
    if (batch.length === 0) break;
    for (const change of batch) {
      changes.push(change);
      if (changes.length >= limit) break;
    }
    if (batch.length < 100) break;
    page++;
  }

  return changes;
}

export async function getChange(
  config: FreshserviceConfig,
  changeId: number,
  include?: string
): Promise<FsChange> {
  const params: Record<string, string> = include ? { include } : {};
  const data = await fsGet<{ change: FsChange }>(config, `changes/${changeId}`, params);
  return data.change;
}

export async function createChange(
  config: FreshserviceConfig,
  payload: CreateChangePayload
): Promise<FsChange> {
  const data = await fsPost<{ change: FsChange }>(
    config,
    "changes",
    withChangePlan(payload)
  );
  return data.change;
}

export async function updateChange(
  config: FreshserviceConfig,
  changeId: number,
  payload: UpdateChangePayload
): Promise<FsChange> {
  const data = await fsPut<{ change: FsChange }>(
    config,
    `changes/${changeId}`,
    withChangePlan(payload)
  );
  return data.change;
}

export type ChangeTicketAssociation =
  | "change_initiated_by_ticket"
  | "change_initiating_ticket";

export async function associateTicketsToChange(
  config: FreshserviceConfig,
  changeDisplayId: number,
  ticketIds: number[],
  associationType: ChangeTicketAssociation = "change_initiated_by_ticket"
): Promise<FsTicket[]> {
  // Freshservice documents no dedicated Changes association endpoint and no
  // associated_tickets field. Its documented ticket association body uses one
  // of these relationship keys with a Change *display_id*. Updating each ticket
  // is therefore the best-supported route; callers can select the inverse
  // relationship if their workflow models a Change that initiates the ticket.
  return Promise.all(
    ticketIds.map((ticketId) =>
      associateOneTicket(config, ticketId, changeDisplayId, associationType)
    )
  );
}

/**
 * Placeholder written into an otherwise-blank ticket description when the
 * association PUT is rejected only because `description` is mandatory on this
 * instance. A single "." is the least-invasive value that satisfies the
 * validator without adding meaningful content.
 */
const BLANK_DESCRIPTION_PLACEHOLDER = ".";

/** True when a thrown API error is the mandatory-`description` 400. */
function isBlankDescriptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // Match the field-level validation Freshservice returns on a ticket PUT:
  //   ... 400: {"errors":[{"field":"description","message":"It should not be blank ...
  return (
    message.includes("400") &&
    message.includes('"field":"description"') &&
    message.toLowerCase().includes("blank")
  );
}

/**
 * Associate a single ticket with a Change.
 *
 * The association is expressed as a ticket update (`PUT /tickets/{id}`), which
 * Freshservice validates as a full ticket write. On instances where
 * `description` is a mandatory field, a ticket whose description is empty is
 * rejected with a 400 even though the association itself is valid. When that
 * specific error occurs we retry ONCE, adding a minimal placeholder
 * description so the association can land; every other error propagates
 * unchanged.
 */
async function associateOneTicket(
  config: FreshserviceConfig,
  ticketId: number,
  changeDisplayId: number,
  associationType: ChangeTicketAssociation
): Promise<FsTicket> {
  const association = { [associationType]: { display_id: changeDisplayId } };
  try {
    return await updateTicket(config, ticketId, association);
  } catch (error) {
    if (!isBlankDescriptionError(error)) throw error;
    // Retry with a placeholder description only if the ticket really has none,
    // so we never overwrite existing content. Read with the default include —
    // an empty include string is rejected by Freshservice with a 400.
    const existing = await getTicket(config, ticketId);
    const currentDescription =
      existing.description_text?.trim() || stripHtml(existing.description ?? "");
    if (currentDescription) throw error;
    return updateTicket(config, ticketId, {
      ...association,
      description: BLANK_DESCRIPTION_PLACEHOLDER,
    });
  }
}

export async function addChangeNote(
  config: FreshserviceConfig,
  changeId: number,
  payload: { body: string; notify_emails?: string[] }
): Promise<FsChangeNote> {
  const data = await fsPost<{ note: FsChangeNote }>(
    config,
    `changes/${changeId}/notes`,
    payload
  );
  return data.note;
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

/** Change priorities use the same numeric values as ticket priorities. */
export const CHANGE_PRIORITY_MAP: Record<number, string> = PRIORITY_MAP;

export const CHANGE_STATUS_MAP: Record<number, string> = {
  1: "Open",
  2: "Planning",
  3: "Awaiting Approval",
  4: "Pending Release",
  5: "Pending Review",
  6: "Closed",
};

export const CHANGE_TYPE_MAP: Record<number, string> = {
  1: "Minor",
  2: "Standard",
  3: "Major",
  4: "Emergency",
};

export const CHANGE_IMPACT_MAP: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
};

export const CHANGE_RISK_MAP: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Very High",
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
