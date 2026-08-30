import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";

import { AppShell, NoKeyNotice } from "@/components/AppShell";
import { SignalMeter } from "@/components/SignalMeter";
import { Button } from "@/components/ui/button";
import { getLeads } from "@/lib/signal.functions";
import { useActiveClient } from "@/lib/use-active-client";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads ranked by fit + intent — Signal" },
      {
        name: "description",
        content:
          "Buying-intent leads captured by the tracking snippet, ranked by a blend of fit score and weighted intent events.",
      },
      { property: "og:title", content: "Leads ranked by fit + intent — Signal" },
      {
        property: "og:description",
        content: "Pricing views, downloads and identifications scored into one signal meter per lead.",
      },
    ],
  }),
  component: LeadsScreen,
});

function LeadsScreen() {
  const { apiKey, ready } = useActiveClient();
  const fetchLeads = useServerFn(getLeads);

  const query = useQuery({
    queryKey: ["leads", apiKey],
    queryFn: () => fetchLeads({ data: { apiKey } }),
    enabled: ready && apiKey.length > 0,
    refetchInterval: 30_000,
  });

  const leads = query.data?.leads ?? [];

  return (
    <AppShell
      title="Leads"
      subtitle="Ranked by fit + intent for the account this console is currently acting as."
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      {ready && !apiKey ? (
        <NoKeyNotice />
      ) : query.isError ? (
        <p className="text-destructive text-sm">{(query.error as Error).message}</p>
      ) : query.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading leads…</p>
      ) : leads.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          No leads yet. Install the snippet from the Embed screen on this account's site.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground data-num text-xs">
            qualified at total score ≥ {query.data?.intentThreshold}
          </p>
          <div className="border-border bg-surface overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-[11px] tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Matched business</th>
                  <th className="px-4 py-3 font-medium">Signal</th>
                  <th className="px-4 py-3 font-medium">Events</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-border/60 border-b last:border-0">
                    <td className="px-4 py-4">
                      <div className="font-medium">{lead.contactName ?? "Unnamed visitor"}</div>
                      <div className="data-num text-muted-foreground text-xs">
                        {lead.contactEmail ?? lead.visitorId ?? "—"}
                      </div>
                      {lead.qualified ? (
                        <span className="bg-hot/15 text-hot mt-1.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                          qualified
                        </span>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground px-4 py-4">{lead.businessName ?? "—"}</td>
                    <td className="px-4 py-4">
                      <SignalMeter
                        fit={lead.fitScore}
                        intent={lead.intentScore}
                        total={lead.totalScore}
                        qualified={lead.qualified}
                      />
                    </td>
                    <td className="data-num px-4 py-4">{lead.eventCount}</td>
                    <td className="data-num text-muted-foreground px-4 py-4 text-xs">
                      {lead.lastSeen ? new Date(lead.lastSeen).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
