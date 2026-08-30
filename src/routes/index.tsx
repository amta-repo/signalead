import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, ScanSearch, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, NoKeyNotice } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assessBusiness, convertToClient, searchBusinesses } from "@/lib/signal.functions";
import type { BusinessCardData } from "@/lib/signal-types";
import { useActiveClient, writeActiveKey } from "@/lib/use-active-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal — Find businesses that need your agency" },
      {
        name: "description",
        content:
          "Search businesses by industry and location, assess their website, HTTPS and payment gaps, and get an AI-tailored pitch for each one.",
      },
      { property: "og:title", content: "Signal — Agency prospecting console" },
      {
        property: "og:description",
        content:
          "Find local businesses with website, HTTPS or payment gaps and pitch them with AI-tailored messaging.",
      },
    ],
  }),
  component: ProspectScreen,
});

const FLAG_LABELS: Record<string, string> = {
  no_website: "no website",
  no_ssl: "no HTTPS",
  no_payment_platform: "no payments",
  site_unreachable: "site unreachable",
};

function ProspectScreen() {
  const { apiKey, ready } = useActiveClient();
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<BusinessCardData[]>([]);

  const search = useServerFn(searchBusinesses);
  const assess = useServerFn(assessBusiness);
  const convert = useServerFn(convertToClient);
  const router = useRouter();

  const searchMutation = useMutation({
    mutationFn: () => search({ data: { apiKey, industry, location } }),
    onSuccess: (data) => {
      setResults(data);
      if (data.length === 0) toast.info("No businesses found for that search.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assessMutation = useMutation({
    mutationFn: (businessId: string) => assess({ data: { apiKey, businessId } }),
    onSuccess: (updated) => {
      setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Assessed ${updated.name}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const convertMutation = useMutation({
    mutationFn: (businessId: string) => convert({ data: { apiKey, businessId } }),
    onSuccess: (result) => {
      setResults((prev) => prev.map((r) => (r.id === result.business.id ? result.business : r)));
      toast.success(`${result.clientName} is now a client`, {
        description: `Key: ${result.apiKey}`,
        duration: 12_000,
        action: {
          label: "Copy key",
          onClick: () => void navigator.clipboard.writeText(result.apiKey),
        },
      });
      void router.invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Find clients"
      subtitle="Discover businesses with gaps your agency can close. Ranked by what you assess, not by promises."
    >
      {ready && !apiKey ? (
        <NoKeyNotice />
      ) : (
        <div className="space-y-6">
          <form
            className="border-border bg-surface grid gap-4 rounded-xl border p-5 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!industry.trim() || !location.trim()) {
                toast.error("Enter both an industry and a location.");
                return;
              }
              searchMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                placeholder="dental clinics"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Cotonou, Benin"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={searchMutation.isPending} className="w-full sm:w-auto">
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </form>

          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Results appear here and are saved under your active account.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {results.map((business) => (
                <article
                  key={business.id}
                  className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold tracking-tight">{business.name}</h2>
                      <p className="text-muted-foreground mt-0.5 truncate text-sm">
                        {business.address ?? "No address on file"}
                      </p>
                    </div>
                    <span
                      className={`data-num shrink-0 rounded-md px-2 py-1 text-[10px] uppercase ${
                        business.status === "client"
                          ? "bg-hot/15 text-hot"
                          : business.status === "assessed"
                            ? "bg-cool/15 text-cool"
                            : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {business.status}
                    </span>
                  </div>

                  {business.website ? (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-cool data-num truncate text-xs underline underline-offset-4"
                    >
                      {business.website}
                    </a>
                  ) : null}

                  {business.assessedAt ? (
                    <div className="flex flex-wrap gap-1.5">
                      {business.signalFlags.length === 0 ? (
                        <span className="bg-surface-2 text-muted-foreground rounded-md px-2 py-1 text-[11px]">
                          no gaps detected
                        </span>
                      ) : (
                        business.signalFlags.map((flag) => (
                          <span
                            key={flag}
                            className="bg-hot/15 text-hot rounded-md px-2 py-1 text-[11px] font-medium"
                          >
                            {FLAG_LABELS[flag] ?? flag}
                          </span>
                        ))
                      )}
                      {business.paymentPlatform ? (
                        <span className="bg-cool/15 text-cool rounded-md px-2 py-1 text-[11px]">
                          {business.paymentPlatform}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {business.pitch ? (
                    <div className="border-border bg-background rounded-lg border p-3">
                      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        Suggested pitch
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{business.pitch}</p>
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={assessMutation.isPending}
                      onClick={() => assessMutation.mutate(business.id)}
                    >
                      {assessMutation.isPending && assessMutation.variables === business.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ScanSearch className="h-4 w-4" />
                      )}
                      {business.assessedAt ? "Re-assess" : "Assess"}
                    </Button>
                    {business.convertedClientId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          writeActiveKey("");
                          toast.info("Switch to this client from the Clients screen.");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Already a client
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={convertMutation.isPending}
                        onClick={() => convertMutation.mutate(business.id)}
                      >
                        {convertMutation.isPending && convertMutation.variables === business.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        Convert to client
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
