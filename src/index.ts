#!/usr/bin/env node
/**
 * Freshservice MCP Server
 *
 * Exposes Freshservice ticket and agent management as MCP tools.
 * Transport: stdio (suitable for use as a spawned subprocess).
 *
 * Required environment variables:
 *   FRESHSERVICE_DOMAIN   - e.g. "yourcompany.freshservice.com"
 *   FRESHSERVICE_API_KEY  - your Freshservice API key
 *
 * Optional:
 *   FRESHSERVICE_READONLY - set to "true" to disable write operations
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type FreshserviceConfig } from "./freshservice-client.js";
import { registerTicketTools } from "./tools/tickets.js";
import { registerAgentTools } from "./tools/agents.js";

// ---------------------------------------------------------------------------
// Config & validation
// ---------------------------------------------------------------------------

function loadConfig(): FreshserviceConfig {
  const domain = process.env.FRESHSERVICE_DOMAIN;
  const apiKey = process.env.FRESHSERVICE_API_KEY;

  if (!domain || !apiKey) {
    console.error(
      "Error: FRESHSERVICE_DOMAIN and FRESHSERVICE_API_KEY environment variables are required.\n" +
      "Example:\n" +
      "  FRESHSERVICE_DOMAIN=yourcompany.freshservice.com\n" +
      "  FRESHSERVICE_API_KEY=your-api-key-here"
    );
    process.exit(1);
  }

  return { domain, apiKey };
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const readonly = process.env.FRESHSERVICE_READONLY === "true";

  const server = new McpServer({
    name: "freshservice-mcp",
    version: "0.1.0",
  });

  // Always register read tools
  registerAgentTools(server, config);

  // Register all ticket tools; if readonly, only read tools are registered
  if (readonly) {
    // Import and register only read-only ticket tools subset
    const { registerReadOnlyTicketTools } = await import("./tools/tickets-readonly.js");
    registerReadOnlyTicketTools(server, config);
    console.error("Freshservice MCP Server running in read-only mode (stdio)");
  } else {
    registerTicketTools(server, config);
    console.error("Freshservice MCP Server running on stdio");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
