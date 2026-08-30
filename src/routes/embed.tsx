import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, NoKeyNotice } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/signal.functions";
import { useActiveClient } from "@/lib/use-active-client";

export const Route = createFileRoute("/embed")({
  head: () => ({
    meta: [
      { title: "Tracking snippet — Signal" },
      {
        name: "description",
        content:
          "Copy the account-specific JavaScript snippet that captures page views, pricing views, downloads and identified emails.",
      },
      { property: "og:title", content: "Tracking snippet — Signal" },
      {
        property: "og:description",
        content: "One paste-and-go snippet per client, keyed to their own tracking key.",
      },
    ],
  }),
  component: EmbedScreen,
});

function buildSnippet(apiKey: string, origin: string): string {
  return `<script>
(function () {
  var KEY = "${apiKey}";
  var ENDPOINT = "${origin}/api/public/track-event";
  var STORE = "signal_visitor_id";

  function visitorId() {
    try {
      var id = localStorage.getItem(STORE);
      if (!id) {
        id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(STORE, id);
      }
      return id;
    } catch (e) {
      return "v_anon_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function send(type, meta) {
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          client_api_key: KEY,
          visitor_id: visitorId(),
          event_type: type,
          url: location.href,
          meta: meta || {}
        })
      });
    } catch (e) {}
  }

  send("page_view");
  if (/pricing|plans/i.test(location.pathname + location.search)) send("pricing_view");

  document.addEventListener("click", function (event) {
    var el = event.target && event.target.closest ? event.target.closest('[data-signal="download"]') : null;
    if (el) send("download", { label: el.getAttribute("data-signal-label") || el.textContent.trim().slice(0, 80) });
  });

  window.Signal = {
    identify: function (email, name) {
      if (!email) return;
      send("identify", { email: email, name: name || null });
    },
    track: function (type, meta) { send(type || "custom", meta); }
  };
})();
</script>`;
}

function EmbedScreen() {
  const { apiKey, ready } = useActiveClient();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const loadSession = useServerFn(getSession);

  useEffect(() => setOrigin(window.location.origin), []);

  const session = useQuery({
    queryKey: ["session", apiKey],
    queryFn: () => loadSession({ data: { apiKey } }),
    enabled: ready && apiKey.length > 0,
  });

  const snippet = apiKey && origin ? buildSnippet(apiKey, origin) : "";

  return (
    <AppShell
      title="Embed"
      subtitle={
        session.data
          ? `Snippet for ${session.data.name}. Paste it before </body> on that site.`
          : "Paste this snippet before </body> on the site you are tracking."
      }
      actions={
        snippet ? (
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(snippet);
              setCopied(true);
              toast.success("Snippet copied");
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy snippet
          </Button>
        ) : null
      }
    >
      {ready && !apiKey ? (
        <NoKeyNotice />
      ) : (
        <div className="space-y-6">
          <pre className="border-border bg-surface data-num overflow-x-auto rounded-xl border p-5 text-xs leading-relaxed">
            {snippet || "Loading snippet…"}
          </pre>

          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="font-semibold tracking-tight">What it captures</h2>
            <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
              <li>
                <span className="text-foreground data-num">page_view</span> — every page load, with a
                persistent visitor id in localStorage.
              </li>
              <li>
                <span className="text-foreground data-num">pricing_view</span> — automatically on any
                URL matching <span className="data-num">pricing</span> or{" "}
                <span className="data-num">plans</span>.
              </li>
              <li>
                <span className="text-foreground data-num">download</span> — any click on an element
                with <span className="data-num">data-signal="download"</span>.
              </li>
              <li>
                <span className="text-foreground data-num">identify</span> — call{" "}
                <span className="data-num">window.Signal.identify(email, name)</span> after a form
                submits to attach a contact to the visitor.
              </li>
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}
