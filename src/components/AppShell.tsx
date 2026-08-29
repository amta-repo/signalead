import { Link } from "@tanstack/react-router";
import { Crosshair, Users, Activity, Code2, KeyRound, Radio } from "lucide-react";
import type { ReactNode } from "react";

import { useActiveClient } from "@/lib/use-active-client";

const NAV = [
  { to: "/", label: "Prospect", icon: Crosshair },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/leads", label: "Leads", icon: Activity },
  { to: "/embed", label: "Embed", icon: Code2 },
  { to: "/account", label: "Account", icon: KeyRound },
] as const;

type AppShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function AppShell({ title, subtitle, children, actions }: AppShellProps) {
  const { apiKey, ready } = useActiveClient();

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <nav
        aria-label="Main"
        className="border-border bg-surface sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center gap-1 border-r py-4"
      >
        <Link to="/" className="text-hot mb-4 flex flex-col items-center" aria-label="Signal home">
          <Radio className="h-6 w-6" />
        </Link>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            activeOptions={{ exact: to === "/" }}
            className="text-muted-foreground hover:text-foreground hover:bg-surface-2 [&.active]:text-hot [&.active]:bg-hot/10 group flex w-[52px] flex-col items-center gap-1 rounded-lg py-2 transition-colors"
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium tracking-tight">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-6 py-4 backdrop-blur md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <span className="border-border bg-surface text-muted-foreground rounded-md border px-2.5 py-1 font-mono text-[11px]">
                {!ready ? "…" : apiKey ? `key ${apiKey.slice(0, 10)}…` : "no key set"}
              </span>
            </div>
          </div>
        </header>
        <main className="px-6 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

export function NoKeyNotice() {
  return (
    <div className="border-border bg-surface text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
      No active API key. Open{" "}
      <Link to="/account" className="text-hot underline underline-offset-4">
        Account
      </Link>{" "}
      and paste the key this console should act as.
    </div>
  );
}
