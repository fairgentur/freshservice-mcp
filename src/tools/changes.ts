/**
 * MCP tool registrations for Freshservice change operations.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck – suppress "type instantiation excessively deep" from Zod × MCP SDK generics
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type FreshserviceConfig,
  listChanges,
  getChange,
  createChange,
  updateChange,
  associateTicketsToChange,
  addChangeNote,
  stripHtml,
  CHANGE_STATUS_MAP,
  CHANGE_TYPE_MAP,
  CHANGE_PRIORITY_MAP,
  CHANGE_IMPACT_MAP,
  CHANGE_RISK_MAP,
} from "../freshservice-client.js";
import { HTML_FIELD_HINT } from "./tickets.js";

function label(value: number, values: Record<number, string>): string {
  return values[value] ?? String(value);
}

function normalizeChange(change: Awaited<ReturnType<typeof getChange>>) {
  return {
    id: change.id,
    subject: change.subject,
    status: label(change.status, CHANGE_STATUS_MAP),
    priority: label(change.priority, CHANGE_PRIORITY_MAP),
    impact: label(change.impact, CHANGE_IMPACT_MAP),
    risk: label(change.risk, CHANGE_RISK_MAP),
    change_type: label(change.change_type, CHANGE_TYPE_MAP),
    requester_id: change.requester_id,
    agent_id: change.agent_id ?? null,
    group_id: change.group_id ?? null,
    planned_start_date: change.planned_start_date ?? null,
    planned_end_date: change.planned_end_date ?? null,
    created_at: change.created_at,
    updated_at: change.updated_at,
    url: `https://${process.env.FRESHSERVICE_DOMAIN}/helpdesk/changes/${change.id}`,
  };
}

const listChangesSchema = z
  .object({
    query: z
      .string()
      .max(512)
      .optional()
      .describe('Freshservice query, e.g. "priority:4 OR priority:3"'),
    view: z
      .string()
      .optional()
      .describe("Default view name or custom Change view ID; cannot be combined with query"),
    updated_since: z
      .string()
      .optional()
      .describe("Return Changes updated since this UTC date or timestamp"),
    workspace_id: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Workspace ID; 0 requests Changes across all accessible workspaces"),
    order_by: z.string().optional().describe("Field to sort by, e.g. priority or updated_at"),
    order_type: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum results (default: 100)"),
  })
  .refine(({ query, view }) => !(query && view), {
    message: "query and view cannot be used together",
  });

const changeFields = {
  subject: z.string().min(1).optional().describe("Change subject"),
  description: z.string().min(1).optional().describe(`Change description. ${HTML_FIELD_HINT}`),
  requester_id: z.number().int().positive().optional().describe("Initiating requester ID"),
  priority: z.enum(["1", "2", "3", "4"]).optional().describe("1=Low, 2=Medium, 3=High, 4=Urgent"),
  status: z.enum(["1", "2", "3", "4", "5", "6"]).optional().describe(
    "1=Open, 2=Planning, 3=Awaiting Approval, 4=Pending Release, 5=Pending Review, 6=Closed"
  ),
  impact: z.enum(["1", "2", "3"]).optional().describe("1=Low, 2=Medium, 3=High"),
  risk: z.enum(["1", "2", "3", "4"]).optional().describe("1=Low, 2=Medium, 3=High, 4=Very High"),
  change_type: z.enum(["1", "2", "3", "4"]).optional().describe(
    "1=Minor, 2=Standard, 3=Major, 4=Emergency"
  ),
  planned_start_date: z.string().optional().describe("Planned start as an ISO 8601 UTC timestamp"),
  planned_end_date: z.string().optional().describe("Planned end as an ISO 8601 UTC timestamp"),
  change_plan: z.string().optional().describe(`Rollout plan. ${HTML_FIELD_HINT}`),
  group_id: z.number().int().positive().optional().describe("Assigned agent group ID"),
  agent_id: z.number().int().positive().optional().describe("Assigned agent ID"),
};

function payloadFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || key === "change_id") continue;
    payload[key] = ["priority", "status", "impact", "risk", "change_type"].includes(key)
      ? Number(value)
      : value;
  }
  return payload;
}

export function registerChangeTools(
  server: McpServer,
  config: FreshserviceConfig
): void {
  server.registerTool(
    "list_changes",
    {
      title: "List Changes",
      description: "List Freshservice Changes with filtering, sorting and pagination.",
      inputSchema: listChangesSchema,
    },
    async (args) => {
      const changes = await listChanges(config, args);
      if (changes.length === 0) {
        return { content: [{ type: "text", text: "No changes found." }] };
      }
      const normalized = changes.map(normalizeChange);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ count: normalized.length, changes: normalized }, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    "get_change",
    {
      title: "Get Change",
      description: "Retrieve full details of a Freshservice Change by ID.",
      inputSchema: z.object({
        change_id: z.number().int().positive().describe("Freshservice Change ID"),
        include: z.string().optional().describe("Extra details to embed, e.g. stats"),
      }),
    },
    async ({ change_id, include }) => {
      const change = await getChange(config, change_id, include);
      const result = {
        ...normalizeChange(change),
        description: change.description_text?.trim() ?? stripHtml(change.description ?? ""),
        change_plan: change.planning_fields?.change_plan
          ? stripHtml(change.planning_fields.change_plan)
          : null,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_change",
    {
      title: "Create Change",
      description: "Create a Freshservice Change with all standard mandatory fields.",
      inputSchema: z.object({
        subject: changeFields.subject.unwrap(),
        description: changeFields.description.unwrap(),
        requester_id: changeFields.requester_id.unwrap(),
        priority: changeFields.priority.unwrap(),
        status: changeFields.status.unwrap(),
        impact: changeFields.impact.unwrap(),
        risk: changeFields.risk.unwrap(),
        change_type: changeFields.change_type.unwrap(),
        planned_start_date: changeFields.planned_start_date.unwrap(),
        planned_end_date: changeFields.planned_end_date.unwrap(),
        change_plan: changeFields.change_plan,
        group_id: changeFields.group_id,
        agent_id: changeFields.agent_id,
      }),
    },
    async (args) => {
      const change = await createChange(config, payloadFromArgs(args));
      return {
        content: [{
          type: "text",
          text: `Change #${change.id} created.\n\n${JSON.stringify(normalizeChange(change), null, 2)}`,
        }],
      };
    }
  );

  server.registerTool(
    "update_change",
    {
      title: "Update Change",
      description: "Update provided fields of an existing Freshservice Change.",
      inputSchema: z.object({
        change_id: z.number().int().positive().describe("Freshservice Change ID"),
        ...changeFields,
      }),
    },
    async (args) => {
      const change = await updateChange(config, args.change_id, payloadFromArgs(args));
      return {
        content: [{
          type: "text",
          text: `Change #${args.change_id} updated.\n\n${JSON.stringify(normalizeChange(change), null, 2)}`,
        }],
      };
    }
  );

  server.registerTool(
    "associate_tickets_to_change",
    {
      title: "Associate Tickets to Change",
      description:
        "Associate existing tickets with a Change by updating each ticket using Freshservice's " +
        "documented Change association object.",
      inputSchema: z.object({
        change_id: z.number().int().positive().describe(
          "Change display ID (Freshservice requires display_id in the association body)"
        ),
        ticket_ids: z.array(z.number().int().positive()).min(1).max(100).describe(
          "Freshservice ticket IDs to associate"
        ),
        association_type: z
          .enum(["change_initiated_by_ticket", "change_initiating_ticket"])
          .optional()
          .describe(
            "Relationship direction. Default: change_initiated_by_ticket (the ticket initiated the Change); " +
            "use change_initiating_ticket when the Change initiated the ticket."
          ),
      }),
    },
    async ({ change_id, ticket_ids, association_type }) => {
      const tickets = await associateTicketsToChange(
        config,
        change_id,
        ticket_ids,
        association_type
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            change_id,
            association_type: association_type ?? "change_initiated_by_ticket",
            associated_ticket_ids: tickets.map((ticket) => ticket.id),
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    "add_change_note",
    {
      title: "Add Change Note",
      description: "Add a note to a Freshservice Change.",
      inputSchema: z.object({
        change_id: z.number().int().positive().describe("Freshservice Change ID"),
        body: z.string().min(1).describe(`Note body. ${HTML_FIELD_HINT}`),
        notify_emails: z.array(z.string().email()).optional().describe("Email addresses to notify"),
      }),
    },
    async ({ change_id, body, notify_emails }) => {
      const note = await addChangeNote(config, change_id, { body, notify_emails });
      return {
        content: [{
          type: "text",
          text: `Note added to Change #${change_id} (note id: ${note.id}).`,
        }],
      };
    }
  );
}
