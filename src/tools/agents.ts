/**
 * MCP tool registrations for Freshservice agent operations.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck – suppress "type instantiation excessively deep" from Zod × MCP SDK generics
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type FreshserviceConfig,
  getMe,
  listAgents,
  type FsAgent,
} from "../freshservice-client.js";

function agentDisplayName(a: FsAgent): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email;
}

function normalizeAgent(a: FsAgent) {
  return {
    id: a.id,
    name: agentDisplayName(a),
    email: a.email,
    group_ids: a.group_ids ?? [],
  };
}

export function registerAgentTools(
  server: McpServer,
  config: FreshserviceConfig
): void {
  // -------------------------------------------------------------------------
  // get_me
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_me",
    {
      title: "Get Current Agent",
      description:
        "Retrieve the profile of the authenticated Freshservice agent " +
        "(i.e. the agent whose API key is configured). " +
        "Useful to get your own agent ID for filtering tickets.",
      inputSchema: z.object({}),
    },
    async () => {
      const agent = await getMe(config);
      const result = normalizeAgent(agent);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // list_agents
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_agents",
    {
      title: "List Agents",
      description:
        "List Freshservice agents. Optionally filter by email address.",
      inputSchema: z.object({
        email: z
          .string()
          .email()
          .optional()
          .describe("Filter agents by exact email address"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum agents to return (default: 50)"),
      }),
    },
    async ({ email, limit }) => {
      const agents = await listAgents(config, { email, per_page: limit ?? 50 });
      if (agents.length === 0) {
        return { content: [{ type: "text", text: "No agents found." }] };
      }
      const normalized = agents.map(normalizeAgent);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: normalized.length, agents: normalized }, null, 2),
          },
        ],
      };
    }
  );
}
