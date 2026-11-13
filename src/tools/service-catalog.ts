/** Service catalog discovery and requests through an item's form and workflow. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  type FreshserviceConfig,
  DEFAULT_STATUS_MAP,
  getServiceCatalogItem,
  listServiceCatalogItems,
  placeServiceRequest,
} from "../freshservice-client.js";
import { customFieldsSchema, normalizeField } from "./ticket-fields.js";
import { HTML_FIELD_HINT, normalizeTicket } from "./tickets.js";

export function registerServiceCatalogTools(
  server: McpServer,
  config: FreshserviceConfig,
  readonly = false
): void {
  // Explicit raw shapes avoid the SDK's deeply recursive Zod inference.
  const listShape = {
    category_id: z.number().int().positive().optional().describe("Filter by service category ID"),
    search: z.string().optional().describe("Case-insensitive substring of the item name; filtered locally across pages"),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum matching items to return (default: 100)"),
    page: z.number().int().positive().optional().describe("First page to read (default: 1); the API returns at most 30 items per page"),
  };
  server.registerTool<{}, typeof listShape>(
    "list_service_catalog_items",
    {
      title: "List Service Catalog Items",
      description:
        "List Freshservice service catalog items, optionally filtered by category and name. " +
        "Follows pages until the matching limit or the end of the catalog. Returns display_id, " +
        "name, category (category ID), short_description and visibility (1=draft, 2=published). " +
        "Call get_service_catalog_item with an item's display_id to inspect its request form.",
      inputSchema: listShape,
      annotations: { readOnlyHint: true },
    },
    async (options) => {
      const items = await listServiceCatalogItems(config, options);
      if (items.length === 0) {
        return { content: [{ type: "text", text: "No service catalog items found." }] };
      }
      const service_items = items.map((item) => ({
        display_id: item.display_id,
        name: item.name,
        category: item.category_id ?? null,
        short_description: item.short_description ?? null,
        visibility: item.visibility ?? null,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: service_items.length, service_items }, null, 2) }],
      };
    }
  );

  const getShape = {
    display_id: z.number().int().positive().describe("Catalog item display_id returned by list_service_catalog_items (not its internal id)"),
  };
  server.registerTool<{}, typeof getShape>(
    "get_service_catalog_item",
    {
      title: "Get Service Catalog Item",
      description:
        "Get a Freshservice catalog item and its form fields under fields, in the same format " +
        "as list_ticket_fields: name, label, field_type, required, dropdown choices and nested_fields. " +
        "Call this before place_service_request. Use each field's exact internal name as a " +
        "custom_fields key and dropdown choice value as its value; set each nested level under " +
        "its own name. Required fields must be supplied even when hidden from the requester. " +
        `For rich-text field values: ${HTML_FIELD_HINT}`,
      inputSchema: getShape,
      annotations: { readOnlyHint: true },
    },
    async ({ display_id }) => {
      const { custom_fields, ...item } = await getServiceCatalogItem(config, display_id);
      const result = { ...item, fields: (custom_fields ?? []).map(normalizeField) };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  if (readonly) return;

  const requestShape = {
    display_id: getShape.display_id,
    quantity: z.number().int().positive().default(1).describe("Quantity requested (default: 1); the item must allow quantities greater than one"),
    email: z.string().email().optional().describe("Requester email; if omitted, Freshservice uses the authenticated agent"),
    requested_for: z.string().email().optional().describe("Email of the person on whose behalf the request is made"),
    custom_fields: customFieldsSchema.describe(
      "Catalog item form values keyed by the exact internal names from get_service_catalog_item. " +
      "Call it first to learn required fields, dropdown choice values and nested level names. " +
      "Pass null to clear a field. For rich-text values: " + HTML_FIELD_HINT
    ),
  };
  server.registerTool<{}, typeof requestShape>(
    "place_service_request",
    {
      title: "Place Service Request",
      description:
        "Create a Freshservice service request through a catalog item's form, workflow and routing. " +
        "Use this instead of create_ticket when the organisation routes a ticket type through " +
        "a catalog item. Call get_service_catalog_item first to learn the required form fields " +
        "and allowed values. Returns the created ticket id and a normalized ticket. " +
        "To set tags, priority or group_id afterwards, call update_ticket on the returned id; " +
        "this tool makes only the place_request call. subject and description are not supported " +
        "by place_request; the catalog item supplies the subject. " +
        `For rich-text custom fields: ${HTML_FIELD_HINT}`,
      inputSchema: requestShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ display_id, quantity, email, requested_for, custom_fields }) => {
      const ticket = await placeServiceRequest(config, display_id, {
        quantity, email, requested_for, custom_fields,
      });
      const result = normalizeTicket(ticket, DEFAULT_STATUS_MAP, config.domain);
      return {
        content: [{
          type: "text",
          text: `Service request #${ticket.id} created.\n\n${JSON.stringify(result, null, 2)}`,
        }],
      };
    }
  );
}
