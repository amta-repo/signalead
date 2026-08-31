import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession, updateThreshold } from "@/lib/signal.functions";
import { useActiveClient } from "@/lib/use-active-client";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account & keys — Signal" },
      {
        name: "description",
        content:
          "Choose which account this console acts as and set the intent threshold used to mark leads qualified.",
      },
      { property: "og:title", content: "Account & keys — Signal" },
      {
        property: "og:description",
        content: "One console, many accounts — switch by tracking key.",
      },
    ],
  }),
  component: AccountScreen,
});

function AccountScreen() {
  const { apiKey, ready, setKey } = useActiveClient();
  const [draft, setDraft] = useState("");
  const [threshold, setThreshold] = useState("60");
  const [agencyName, setAgencyName] = useState("My Agency");
  const loadSession = useServerFn(getSession);
  const saveThreshold = useServerFn(updateThreshold);
  const checkAgency = useServerFn(agencyExists);
  const createAgency = useServerFn(bootstrapAgency);
  const queryClient = useQueryClient();

  useEffect(() => setDraft(apiKey), [apiKey]);

  const agencyProbe = useQuery({
    queryKey: ["agency-exists"],
    queryFn: () => checkAgency(),
    enabled: ready && apiKey.length === 0,
    retry: false,
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => createAgency({ data: { name: agencyName } }),
    onSuccess: (result) => {
      setKey(result.apiKey);
      setDraft(result.apiKey);
      toast.success(`Agency "${result.name}" created`, {
        description: "Save this key somewhere safe — it's your owner key.",
        duration: 15_000,
      });
      void queryClient.invalidateQueries({ queryKey: ["agency-exists"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const session = useQuery({
    queryKey: ["session", apiKey],
    queryFn: () => loadSession({ data: { apiKey } }),
    enabled: ready && apiKey.length > 0,
    retry: false,
  });



  useEffect(() => {
    if (session.data) setThreshold(String(session.data.intentThreshold));
  }, [session.data]);

  const thresholdMutation = useMutation({
    mutationFn: () =>
      saveThreshold({ data: { apiKey, intentThreshold: Number.parseInt(threshold, 10) } }),
    onSuccess: (result) => {
      toast.success(`Threshold set to ${result.intentThreshold}`);
      void queryClient.invalidateQueries({ queryKey: ["session"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Account"
      subtitle="The console acts as whichever account key is active here — your agency, or any client you manage."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-border bg-surface space-y-4 rounded-xl border p-5">
          <div>
            <h2 className="font-semibold tracking-tight">Active account key</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Stored in this browser only. Never sent anywhere except this app's own server.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">Account API key</Label>
            <Input
              id="apiKey"
              className="data-num"
              placeholder="sk_agency_…"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setKey(draft);
                toast.success(draft.trim() ? "Key saved" : "Key cleared");
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              Use this key
            </Button>
            {apiKey ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setKey("");
                  setDraft("");
                  toast.info("Key cleared");
                }}
              >
                <LogOut className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </div>
        </section>

        <section className="border-border bg-surface space-y-4 rounded-xl border p-5">
          <div>
            <h2 className="font-semibold tracking-tight">Current account</h2>
            {!ready || !apiKey ? (
              <p className="text-muted-foreground mt-1 text-sm">No key set yet.</p>
            ) : session.isError ? (
              <p className="text-destructive mt-1 text-sm">{(session.error as Error).message}</p>
            ) : session.isLoading ? (
              <p className="text-muted-foreground mt-1 text-sm">Checking key…</p>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{session.data?.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className={session.data?.isAgency ? "text-hot" : "text-cool"}>
                    {session.data?.isAgency ? "agency (owner)" : "managed client"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account id</dt>
                  <dd className="data-num text-xs">{session.data?.id}</dd>
                </div>
              </dl>
            )}
          </div>

          {session.data ? (
            <div className="border-border space-y-2 border-t pt-4">
              <Label htmlFor="threshold">Intent threshold (qualified at total score ≥)</Label>
              <div className="flex gap-2">
                <Input
                  id="threshold"
                  className="data-num max-w-[120px]"
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ""))}
                />
                <Button
                  variant="secondary"
                  disabled={thresholdMutation.isPending || threshold === ""}
                  onClick={() => thresholdMutation.mutate()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
