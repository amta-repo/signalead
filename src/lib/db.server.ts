import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

/**
 * Service-role client for the user's own Supabase project.
 * Server-only: never import this from a component or a module scope that the
 * browser bundle can reach.
 */
export function getDb(): SupabaseClient {
  if (cached) return cached;

  const url = process.env["SIGNAL_DB_URL"];
  const key = process.env["SIGNAL_DB_SERVICE_KEY"];
  if (!url || !key) {
    throw new Error(
      "Database is not configured. Add SIGNAL_DB_URL and SIGNAL_DB_SERVICE_KEY secrets.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        // sb_secret_* keys are opaque, not JWTs: send them only as `apikey`.
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  return cached;
}
