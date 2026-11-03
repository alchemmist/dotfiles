function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textFromHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function searchResultUrl(href: string): string {
  const url = new URL(decodeHtml(href), "https://www.bing.com");
  const encoded = url.searchParams.get("u");
  if (url.hostname === "www.bing.com" && encoded?.startsWith("a1")) {
    try {
      return Buffer.from(encoded.slice(2), "base64").toString("utf8");
    } catch {}
  }
  return url.href;
}

export default function (pi: any) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the public web using Bing and return linked results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: { type: "number", description: "Maximum results (default 5)" },
      },
      required: ["query"],
    } as any,
    async execute(_id: string, params: { query: string; max_results?: number }, signal: AbortSignal) {
      const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(params.query)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebSearch/1.0)" },
        signal,
      });
      if (!response.ok) throw new Error(`Bing search failed (${response.status})`);
      const html = await response.text();
      const results = [...html.matchAll(/<li class="b_algo"[\s\S]*?<h2><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/li>/g)]
        .slice(0, Math.max(1, Math.min(params.max_results ?? 5, 10)))
        .map((match) => ({ url: searchResultUrl(match[1]), title: textFromHtml(match[2]), snippet: textFromHtml(match[3]).slice(0, 600) }));
      return { content: [{ type: "text", text: results.length ? results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n") : "No search results found." }], details: { results } };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch a public web page and extract readable text.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "HTTP or HTTPS URL" } },
      required: ["url"],
    } as any,
    async execute(_id: string, params: { url: string }, signal: AbortSignal) {
      const url = new URL(params.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are supported");
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebFetch/1.0)" }, signal });
      if (!response.ok) throw new Error(`Page fetch failed (${response.status})`);
      const html = await response.text();
      const title = textFromHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname);
      const content = textFromHtml(html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " "));
      return { content: [{ type: "text", text: `Title: ${title}\nURL: ${url.href}\n\n${content.slice(0, 20000)}` }], details: { title, url: url.href } };
    },
  });
}
