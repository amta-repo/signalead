import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmp-probe")({
  server: {
    handlers: {
      GET: async () => {
        const { getDb } = await import("@/lib/db.server");
        const { data, error } = await getDb()
          .from("clients")
          .select("id, name, api_key, parent_client_id")
          .is("parent_client_id", null)
          .limit(1);
        return Response.json({ error: error?.message ?? null, rows: data });
      },
    },
  },
});
