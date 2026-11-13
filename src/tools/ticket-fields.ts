/**
 * Ticket form field discovery and shared custom-field helpers.
 * Read-only, so registered in both normal and read-only mode.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck – suppress "type instantiation excessively deep" from Zod × MCP SDK generics
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  type FreshserviceConfig,
  type FsCatalogItemField,
  type FsTicketField,
  listTicketFields,
} from "../freshservice-client.js";

/** Shared custom-field values for ticket writes and service catalog requests. */
export const customFieldsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
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

/**
 * Choices come as objects ({ id, value, nested_options }) or plain strings.
 * The id is kept: default fields (status, priority, group, ...) are written by id.
 */
function normalizeChoices(choices: unknown[] | undefined): unknown[] | undefined {
  if (!choices || choices.length === 0) return undefined;
  return choices.map((choice) => {
    if (typeof choice !== "object" || choice === null) return choice;
    const c = choice as Record<string, unknown>;
    const nested = (c.nested_options ?? c.choices) as unknown[] | undefined;
    const subChoices = Array.isArray(nested) ? normalizeChoices(nested) : undefined;
    return {
      ...(c.id !== undefined ? { id: c.id } : {}),
      value: c.value,
      ...(subChoices ? { sub_choices: subChoices } : {}),
    };
  });
}

/** Levels 2 and 3 of a nested field, each written under its own name. */
function normalizeNestedFields(nested: unknown[] | undefined) {
  if (!nested || nested.length === 0) return undefined;
  return nested.map((n) => {
    const level = n as Record<string, unknown>;
    return { name: level.name, label: level.label, level: level.level };
  });
}

export function normalizeField(f: FsTicketField | FsCatalogItemField) {
  const choices = normalizeChoices(f.choices);
  const nestedFields = normalizeNestedFields(f.nested_fields);
  return {
    name: f.name,
    label: f.label,
    field_type: f.field_type,
    custom: !f.default_field,
    // Ticket fields report required_for_agents; catalog fields use required.
    required: f.required_for_agents ?? f.required ?? false,
    required_for_closure: f.required_for_closure ?? false,
    ...(f.description ? { description: f.description } : {}),
    ...(choices ? { choices } : {}),
    ...(nestedFields ? { nested_fields: nestedFields } : {}),
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
        "type, whether it is required for agents, and the allowed choices of dropdown fields. " +
        "Use the internal names (e.g. cf_release) as keys for `custom_fields` in " +
        "create_ticket / update_ticket. Custom dropdowns take the choice `value`; built-in " +
        "fields such as status, priority or group take the choice `id`. Nested fields list " +
        "their lower levels under `nested_fields`; set each level under its own name.",
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
