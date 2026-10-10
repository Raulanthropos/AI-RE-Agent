import type { WebsiteAdapter } from "../types.js";

export function website(
  id: string,
  name: string,
  domain: string,
  pattern: RegExp,
): WebsiteAdapter {
  return {
    id,
    name,
    domain,
    identify(url) {
      const match = url.pathname.match(pattern);
      if (!match?.[1]) return null;
      // Query strings and translated slugs do not change the portal's listing identity.
      url.search = "";
      url.hash = "";
      url.hostname = "www." + domain;
      return {
        sourceId: id,
        sourceName: name,
        externalId: match[1],
        url: url.toString(),
      };
    },
  };
}
