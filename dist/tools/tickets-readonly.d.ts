/**
 * Read-only subset of ticket tools.
 * Registered when FRESHSERVICE_READONLY=true is set.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type FreshserviceConfig } from "../freshservice-client.js";
export declare function registerReadOnlyTicketTools(server: McpServer, config: FreshserviceConfig): void;
//# sourceMappingURL=tickets-readonly.d.ts.map