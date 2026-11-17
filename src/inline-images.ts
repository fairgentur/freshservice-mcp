/** Inline image discovery from Freshservice's original HTML bodies. */

import { Parser } from "htmlparser2";
import { type FreshserviceConfig } from "./freshservice-client.js";

export interface InlineImageSource {
  src: string;
  alt?: string;
}

export interface InlineImage {
  image_index: number;
  url?: string;
  alt?: string;
  embedded?: boolean;
  content_type?: string;
  downloadable: boolean;
}

/** Supported public asset hosts; external requests never receive the API key. */
export function isInlineImageUrlAllowed(config: FreshserviceConfig, url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.origin === new URL(`https://${config.domain}`).origin) return true;
  if (url.port) return false;
  const host = url.hostname;
  const assetDomains = ["freshservice.com", "freshdesk.com", "freshworks.com", "freshgenie.com", "cloudfront.net"];
  return assetDomains.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
    host === "s3.amazonaws.com" ||
    /^(?:[a-z0-9.-]+\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host);
}

export function inlineImageData(src: string): { contentType: string; base64: string } | undefined {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/\s]*={0,2})$/i.exec(src);
  if (!match) return undefined;
  const base64 = match[2].replace(/\s/g, "");
  if (!base64 || base64.length % 4 === 1) return undefined;
  return { contentType: match[1].toLowerCase(), base64 };
}

/** Decode HTML attributes, resolve relative sources and keep one entry per source. */
export function extractInlineImageSources(html: string | undefined, config: FreshserviceConfig): InlineImageSource[] {
  if (!html) return [];
  const images: InlineImageSource[] = [];
  const seen = new Set<string>();
  const hiddenTags = new Set(["script", "style", "template"]);
  let hidden = 0;
  const parser = new Parser({
    onopentag(name, attrs) {
      if (hiddenTags.has(name)) hidden++;
      if (hidden) return;
      if (name !== "img" || !attrs.src?.trim()) return;
      const raw = attrs.src.trim();
      let src: string;
      try {
        const url = new URL(raw, `https://${config.domain}/`);
        if (!["https:", "http:", "data:", "cid:", "blob:"].includes(url.protocol)) return;
        src = url.href;
      } catch {
        return;
      }
      if (seen.has(src)) return;
      seen.add(src);
      images.push({ src, ...(attrs.alt ? { alt: attrs.alt } : {}) });
    },
    onclosetag(name) { if (hiddenTags.has(name)) hidden--; },
  }, { decodeEntities: true });
  parser.end(html);
  return images;
}

/** Do not duplicate embedded base64 data into the model's text context. */
export function inlineImages(html: string | undefined, config: FreshserviceConfig): InlineImage[] {
  return extractInlineImageSources(html, config).map((image, index) => {
    const embedded = inlineImageData(image.src);
    const isData = image.src.startsWith("data:");
    return {
      image_index: index + 1,
      ...(image.alt ? { alt: image.alt } : {}),
      ...(isData ? { embedded: true } : { url: image.src }),
      ...(embedded ? { content_type: embedded.contentType } : {}),
      downloadable: embedded !== undefined || (!isData && isInlineImageUrlAllowed(config, new URL(image.src))),
    };
  });
}
