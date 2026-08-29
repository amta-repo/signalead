import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
} as const;

const Payload = z.object({
  client_api_key: z.string().min(8).max(200),
  visitor_id: z.string().min(4).max(200),
  event_type: z.enum(["page_view", "pricing_view", "download", "identify", "custom"]),
  url: z.string().max(2000).optional().nullable(),
  meta: z.record(z.unknown()).optional(),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/track-event")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(await request.json());
        } catch {
          return json({ error: "Invalid payload" }, 400);
        }

        try {
          const { recordEvent } = await import("@/lib/signal-ops.server");
          await recordEvent({
            apiKey: parsed.client_api_key,
            visitorId: parsed.visitor_id,
            eventType: parsed.event_type,
            url: parsed.url ?? null,
            meta: (parsed.meta ?? {}) as Record<string, unknown>,
          });
          return json({ ok: true }, 200);
        } catch (error) {
          console.error("track-event failed", error);
          // Never leak internals to a third-party site's visitors.
          return json({ error: "Event rejected" }, 400);
        }
      },
    },
  },
});
