/**
 * Read-only subset of Freshservice Change tools.
 * Registered when FRESHSERVICE_READONLY=true is set.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck – suppress "type instantiation excessively deep" from Zod × MCP SDK generics
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type FreshserviceConfig,
  listChanges,
  getChange,
  stripHtml,
  CHANGE_STATUS_MAP,
  CHANGE_TYPE_MAP,
  CHANGE_PRIORITY_MAP,
  CHANGE_IMPACT_MAP,
  CHANGE_RISK_MAP,
} from "../freshservice-client.js";

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

export function registerReadOnlyChangeTools(
  server: McpServer,
  config: FreshserviceConfig
): void {
  server.registerTool(
    "list_changes",
    {
      title: "List Changes",
      description: "List Freshservice Changes with filtering, sorting and pagination.",
      inputSchema: z
        .object({
          query: z.string().max(512).optional(),
          view: z.string().optional(),
          updated_since: z.string().optional(),
          workspace_id: z.number().int().nonnegative().optional(),
          order_by: z.string().optional(),
          order_type: z.enum(["asc", "desc"]).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .refine(({ query, view }) => !(query && view), {
          message: "query and view cannot be used together",
        }),
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
        change_id: z.number().int().positive(),
        include: z.string().optional(),
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
}
