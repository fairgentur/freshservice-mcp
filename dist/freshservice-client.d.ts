/**
 * Freshservice API client.
 * Zero-dependency HTTP wrapper using native fetch (Node.js 18+).
 * Auth: HTTP Basic with "<API_KEY>:X" (Freshservice convention).
 */
export interface FreshserviceConfig {
    domain: string;
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
    requester?: {
        name?: string;
        email?: string;
        id?: number;
    };
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
export declare function stripHtml(html: string): string;
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
export declare function listTickets(config: FreshserviceConfig, options?: ListTicketsOptions): Promise<FsTicket[]>;
export declare function getTicket(config: FreshserviceConfig, ticketId: number, include?: string): Promise<FsTicket>;
export declare function createTicket(config: FreshserviceConfig, payload: CreateTicketPayload): Promise<FsTicket>;
export declare function updateTicket(config: FreshserviceConfig, ticketId: number, payload: UpdateTicketPayload): Promise<FsTicket>;
export declare function getTicketConversations(config: FreshserviceConfig, ticketId: number): Promise<FsConversation[]>;
export interface AddNotePayload {
    body: string;
    /** true = private note, false = public reply */
    private?: boolean;
    notify_emails?: string[];
}
export declare function addTicketNote(config: FreshserviceConfig, ticketId: number, payload: AddNotePayload): Promise<FsConversation>;
export declare function replyToTicket(config: FreshserviceConfig, ticketId: number, payload: {
    body: string;
    cc_emails?: string[];
}): Promise<FsConversation>;
export declare function getMe(config: FreshserviceConfig): Promise<FsAgent>;
export declare function listAgents(config: FreshserviceConfig, options?: {
    email?: string;
    per_page?: number;
}): Promise<FsAgent[]>;
/** Default status map as fallback if the API endpoint is unavailable */
export declare const DEFAULT_STATUS_MAP: Record<number, string>;
export declare const PRIORITY_MAP: Record<number, string>;
export declare function getTicketStatuses(config: FreshserviceConfig): Promise<Record<number, string>>;
//# sourceMappingURL=freshservice-client.d.ts.map