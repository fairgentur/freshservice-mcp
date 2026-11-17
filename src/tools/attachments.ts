/** Read-only attachment tools, available in both server modes. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  type FreshserviceConfig,
  type FsAttachment,
  type FsRequestedItem,
  downloadAttachment,
  downloadInlineImage,
  getTicket,
  getTicketConversations,
  getTicketRequestedItems,
} from "../freshservice-client.js";
import { extractInlineImageSources, inlineImages } from "../inline-images.js";

function inlineAttachments(
  html: string | undefined,
  existing: FsAttachment[],
  config: FreshserviceConfig,
  context: { ticket_id: number; source: string; conversation_id: number | null; private: boolean | null }
) {
  const existingUrls = new Set(existing.flatMap((attachment) =>
    [attachment.attachment_url, attachment.canonical_url, attachment.canonical_path].flatMap((value) => {
      if (!value) return [];
      try { return [new URL(value, `https://${config.domain}/`).href]; } catch { return []; }
    })
  ));
  return inlineImages(html, config)
    .filter((image) => !image.url || !existingUrls.has(image.url))
    .map(({ url, ...image }) => ({
      ...image,
      name: image.alt ?? `Inline image ${image.image_index}`,
      ...(url ? { attachment_url: url } : {}),
      inline: true,
      ...context,
    }));
}

function isAttachment(value: unknown): value is FsAttachment {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string" && typeof item.content_type === "string" &&
    typeof item.size === "number" &&
    (Number.isSafeInteger(item.id) || typeof item.attachment_url === "string");
}

function requestedItemAttachments(item: FsRequestedItem) {
  const fields = Object.entries(item.custom_fields ?? {}).flatMap(([field_name, value]) =>
    (Array.isArray(value) ? value : [value]).filter(isAttachment).map((a) => ({ ...a, field_name }))
  );
  const seen = new Set<string>();
  return [...fields, ...(item.attachments ?? [])].flatMap((a) => {
    // Freshservice can return the same file in the form's attachment field and
    // the requested item's main array. Keep its field context and list it once.
    const key = a.id !== undefined ? `id:${a.id}` : `url:${a.attachment_url}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...a,
      source: "requested_item",
      conversation_id: null,
      private: null,
      requested_item_id: item.id,
      service_item_id: item.service_item_id ?? null,
      service_item_name: item.service_item_name ?? null,
    }];
  });
}

export function registerAttachmentTools(server: McpServer, config: FreshserviceConfig): void {
  // Explicit raw-shape types avoid the SDK's deeply recursive Zod inference.
  server.registerTool<{}, { ticket_id: z.ZodNumber }>(
    "list_ticket_attachments",
    {
      title: "List Ticket Attachments",
      description:
        "List attachment metadata from a ticket description, every conversation (including private notes), " +
        "inline images from their HTML, and service-request forms (requested items and their attachment fields). " +
        "Returns IDs when supplied by Freshservice, names, MIME types, sizes, download URLs and source context. " +
        "Use download_attachment with an attachment ID to retrieve the file contents. Inline entries have " +
        "inline: true and image_index; use download_inline_image with ticket_id, image_index and " +
        "conversation_id when present. Unknown image size/type is omitted; downloadable indicates a supported source.",
      inputSchema: { ticket_id: z.number().int().safe().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ ticket_id }) => {
      const ticket = await getTicket(config, ticket_id, "ticket_attachments");
      const conversations = await getTicketConversations(config, ticket_id);
      const requestedItems = ticket.type === "Service Request"
        ? await getTicketRequestedItems(config, ticket_id)
        : [];
      const attachments = [
        ...(ticket.attachments ?? []).map((a) => ({
          ...a, source: "ticket", conversation_id: null, private: null,
        })),
        ...inlineAttachments(ticket.description, ticket.attachments ?? [], config, {
          ticket_id, source: "ticket", conversation_id: null, private: null,
        }),
        ...conversations.flatMap((c) => [
          ...(c.attachments ?? []).map((a) => ({
            ...a, source: "conversation", conversation_id: c.id, private: c.private,
          })),
          ...inlineAttachments(c.body, c.attachments ?? [], config, {
            ticket_id, source: "conversation", conversation_id: c.id, private: c.private,
          }),
        ]),
        ...requestedItems.flatMap(requestedItemAttachments),
      ];
      return {
        content: [{ type: "text", text: JSON.stringify({ ticket_id, count: attachments.length, attachments }, null, 2) }],
      };
    }
  );

  const inlineShape = {
    ticket_id: z.number().int().safe().positive().describe("Ticket containing the inline image"),
    conversation_id: z.number().int().safe().positive().optional().describe("Conversation ID for a comment image; omit for the ticket description"),
    image_index: z.number().int().safe().positive().describe("1-based image_index from inline_images or an inline entry in list_ticket_attachments"),
  };
  server.registerTool<{}, typeof inlineShape>(
    "download_inline_image",
    {
      title: "Download Inline Image",
      description:
        "Retrieve an inline image from a ticket description or comment, including pasted screenshots " +
        "that are absent from attachments. First call get_ticket, get_ticket_comments or " +
        "list_ticket_attachments to discover image_index and conversation_id. Re-reads the source " +
        "ticket/comment using the API agent's permissions; accepts no arbitrary download URL. " +
        "Supports embedded PNG/JPEG/GIF/WebP data and HTTPS images on the configured Freshservice " +
        "origin or supported Freshworks/CDN asset hosts. Other sources remain visible as metadata. " +
        "Returns PNG/JPEG/GIF/WebP as MCP images and other image formats as embedded resources. " +
        "Downloads are limited to 10 MiB and 30 seconds; the API key is never sent to external asset hosts.",
      inputSchema: inlineShape,
      annotations: { readOnlyHint: true },
    },
    async ({ ticket_id, conversation_id, image_index }) => {
      let html: string | undefined;
      if (conversation_id !== undefined) {
        const conversations = await getTicketConversations(config, ticket_id);
        const conversation = conversations.find((item) => item.id === conversation_id);
        if (!conversation) throw new Error("Conversation not found on this ticket.");
        html = conversation.body;
      } else {
        html = (await getTicket(config, ticket_id)).description;
      }
      const image = extractInlineImageSources(html, config)[image_index - 1];
      if (!image) throw new Error("Inline image not found. Refresh the ticket or comments and use their current image_index.");
      const { data, contentType } = await downloadInlineImage(config, image.src);
      const mimeType = contentType.split(";")[0].trim().toLowerCase();
      if (!mimeType.startsWith("image/")) throw new Error("Inline image download did not return an image.");
      if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType)) {
        return { content: [{ type: "image", mimeType, data: data.toString("base64") }] };
      }
      const source = conversation_id === undefined ? "description" : `conversations/${conversation_id}`;
      const uri = `freshservice://tickets/${ticket_id}/${source}/inline-images/${image_index}`;
      return { content: [{ type: "resource", resource: { uri, mimeType, blob: data.toString("base64") } }] };
    }
  );

  server.registerTool<{}, { attachment_id: z.ZodNumber }>(
    "download_attachment",
    {
      title: "Download Attachment",
      description:
        "Download a Freshservice attachment by ID, up to 10 MiB. Get IDs from list_ticket_attachments, " +
        "get_ticket or get_ticket_comments. Uses the authenticated attachment endpoint; access follows " +
        "the API agent's permissions. Returns text files as embedded text resources, PNG/JPEG/GIF/WebP " +
        "as images and other files (including PDFs) as base64 embedded resources. No server-side file is written.",
      inputSchema: { attachment_id: z.number().int().safe().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ attachment_id }) => {
      const { data, contentType } = await downloadAttachment(config, attachment_id);
      const mimeType = contentType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
      const uri = `https://${config.domain}/api/v2/attachments/${attachment_id}`;
      if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType)) {
        return { content: [{ type: "image", mimeType, data: data.toString("base64") }] };
      }
      if (mimeType.startsWith("text/") || /(?:\/|\+)(?:json|xml)$/.test(mimeType)) {
        const charset = /charset\s*=\s*"?([^;"\s]+)/i.exec(contentType)?.[1] ?? "utf-8";
        try {
          const text = new TextDecoder(charset, { fatal: true }).decode(data);
          return { content: [{ type: "resource", resource: { uri, mimeType, text } }] };
        } catch {
          // Keep the original bytes for unknown encodings or invalid text.
        }
      }
      return { content: [{ type: "resource", resource: { uri, mimeType, blob: data.toString("base64") } }] };
    }
  );
}
