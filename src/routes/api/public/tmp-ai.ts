import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/tmp-ai")({
  server: { handlers: { GET: async () => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return Response.json({ hasKey: false });
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({ model: "google/gemini-3.7-flash", messages: [{ role: "user", content: "Say OK." }] }),
    });
    return Response.json({ hasKey: true, status: r.status, body: (await r.text()).slice(0, 300) });
  } } },
});
