/**
 * Ticket form field discovery and shared custom-field helpers.
 * Read-only, so registered in both normal and read-only mode.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck – suppress "type instantiation excessively deep" from Zod × MCP SDK generics
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type FreshserviceConfig,
  type FsTicketField,
  listTicketFields,
} from "../freshservice-client.js";

/** Input schema for `custom_fields` on create_ticket / update_ticket. */
export const customFieldsSchema = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional()
  .describe(
    "Instance-specific custom fields, keyed by their internal name, e.g. " +
      "{\"cf_release\": \"2024.10\", \"cf_reviewed\": true}. Call list_ticket_fields first " +
      "to get the internal names and the allowed values of dropdown fields; Freshservice " +
      "rejects unknown names and dropdown values that are not in the choice list. " +
      "Pass null to clear a field."
  );

/**
 * Custom field values of a ticket, without empty entries.
 * Freshservice returns every custom field on every ticket, mostly null.
 */
export function nonEmptyCustomFields(
  customFields: Record<string, unknown> | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(customFields ?? {})) {
    if (value !== null && value !== undefined && value !== "") result[name] = value;
  }
  return result;
}

/** Choices come as objects ({ value, nested_options }) or plain strings. */
function normalizeChoices(choices: unknown[] | undefined): unknown[] | undefined {
  if (!choices || choices.length === 0) return undefined;
  return choices.map((choice) => {
    if (typeof choice !== "object" || choice === null) return choice;
    const c = choice as Record<string, unknown>;
    const nested = (c.nested_options ?? c.choices) as unknown[] | undefined;
    const subChoices = Array.isArray(nested) ? normalizeChoices(nested) : undefined;
    return subChoices ? { value: c.value, sub_choices: subChoices } : c.value;
  });
}

function normalizeField(f: FsTicketField) {
  const choices = normalizeChoices(f.choices);
  return {
    name: f.name,
    label: f.label,
    field_type: f.field_type,
    custom: !f.default_field,
    required: f.required ?? false,
    required_for_closure: f.required_for_closure ?? false,
    ...(f.description ? { description: f.description } : {}),
    ...(choices ? { choices } : {}),
  };
}

export function registerTicketFieldTools(
  server: McpServer,
  config: FreshserviceConfig
): void {
  server.registerTool(
    "list_ticket_fields",
    {
      title: "List Ticket Fields",
      description:
        "List the ticket form fields of this Freshservice instance: internal name, label, " +
        "type, whether it is required, and the allowed choices of dropdown fields. " +
        "Use the internal names (e.g. cf_release) as keys for `custom_fields` in " +
        "create_ticket / update_ticket.",
      inputSchema: z.object({
        include_default: z
          .boolean()
          .optional()
          .describe("Also list built-in fields such as status or priority (default: false, custom fields only)"),
      }),
    },
    async ({ include_default }) => {
      const fields = await listTicketFields(config);
      const selected = include_default ? fields : fields.filter((f) => !f.default_field);
      if (selected.length === 0) {
        return { content: [{ type: "text", text: "No ticket fields found." }] };
      }
      const normalized = selected.map(normalizeField);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: normalized.length, fields: normalized }, null, 2),
          },
        ],
      };
    }
  );
}
