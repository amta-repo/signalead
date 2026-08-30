import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Copy } from "lucide-react";
import { toast } from "sonner";

import { AppShell, NoKeyNotice } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { listClients } from "@/lib/signal.functions";
import { useActiveClient } from "@/lib/use-active-client";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "My clients — Signal" },
      {
        name: "description",
        content:
          "Every business you converted into a client, with its tracking key and the intent threshold used to qualify its leads.",
      },
      { property: "og:title", content: "My clients — Signal" },
      {
        property: "og:description",
        content: "Switch the console between your agency and any client you manage.",
      },
    ],
  }),
  component: ClientsScreen,
});

function ClientsScreen() {
  const { apiKey, ready, setKey } = useActiveClient();
  const fetchClients = useServerFn(listClients);
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["clients", apiKey],
    queryFn: () => fetchClients({ data: { apiKey } }),
    enabled: ready && apiKey.length > 0,
  });

  return (
    <AppShell
      title="My clients"
      subtitle="Businesses you converted. Switch into one to see its own leads and embed snippet."
    >
      {ready && !apiKey ? (
        <NoKeyNotice />
      ) : query.isError ? (
        <p className="text-destructive text-sm">{(query.error as Error).message}</p>
      ) : query.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading clients…</p>
      ) : (query.data ?? []).length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          No clients yet. Convert a prospect on the Prospect screen.
        </div>
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border text-muted-foreground border-b text-left text-[11px] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Tracking key</th>
                <th className="px-4 py-3 font-medium">Threshold</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((client) => (
                <tr key={client.id} className="border-border/60 border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{client.name}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="data-num text-cool hover:text-foreground text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(client.apiKey);
                        toast.success("Key copied");
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {client.apiKey.slice(0, 18)}… <Copy className="h-3 w-3" />
                      </span>
                    </button>
                  </td>
                  <td className="data-num px-4 py-3">{client.intentThreshold}</td>
                  <td className="data-num text-muted-foreground px-4 py-3 text-xs">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setKey(client.apiKey);
                        toast.success(`Now acting as ${client.name}`);
                        void navigate({ to: "/embed" });
                      }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Switch to this client
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
