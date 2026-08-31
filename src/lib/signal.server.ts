import { getDb } from "./db.server";

export type ClientRow = {
  id: string;
  name: string;
  api_key: string;
  intent_threshold: number;
  parent_client_id: string | null;
  created_at: string;
};

export type BusinessRow = {
  id: string;
  client_id: string;
  place_id: string | null;
  name: string;
  address: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  industry: string | null;
  has_website: boolean | null;
  has_ssl: boolean | null;
  payment_platform_detected: string | null;
  signal_flags: string[];
  pitch_suggestion: string | null;
  assessed_at: string | null;
  status: string;
  converted_client_id: string | null;
};

export class SignalError extends Error {}

/** Resolves an api_key to its client row. Throws on unknown keys. */
export async function requireClient(apiKey: string): Promise<ClientRow> {
  const key = apiKey.trim();
  if (!key) throw new SignalError("No API key set. Add one on the Account screen.");

  const { data, error } = await getDb()
    .from("clients")
    .select("id, name, api_key, intent_threshold, parent_client_id, created_at")
    .eq("api_key", key)
    .maybeSingle();

  if (error) throw new SignalError(`Database error: ${error.message}`);
  if (!data) throw new SignalError("That API key does not match any client.");
  return data as ClientRow;
}

export function newApiKey(prefix = "sk_client"): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

// ------------------------------------------------------------------ Places

type PlacesResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
};

export async function placesTextSearch(query: string): Promise<PlacesResult[]> {
  const key = process.env["GOOGLE_PLACES_API_KEY"];
  if (!key) throw new SignalError("Google Places is not configured (GOOGLE_PLACES_API_KEY).");

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);

  const res = await fetchWithTimeout(url.toString(), 12_000);
  if (!res.ok) throw new SignalError(`Places search failed (${res.status}).`);

  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: PlacesResult[];
  };

  if (body.status === "ZERO_RESULTS") return [];
  if (body.status !== "OK") {
    throw new SignalError(body.error_message ?? `Places search failed (${body.status}).`);
  }
  return body.results ?? [];
}

export async function placeDetailsWebsite(placeId: string): Promise<string | null> {
  const key = process.env["GOOGLE_PLACES_API_KEY"];
  if (!key) throw new SignalError("Google Places is not configured (GOOGLE_PLACES_API_KEY).");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,url,name");
  url.searchParams.set("key", key);

  const res = await fetchWithTimeout(url.toString(), 12_000);
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: { website?: string } };
  return body.result?.website ?? null;
}

// ------------------------------------------------------- payment detection

const GATEWAYS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Stripe", patterns: [/js\.stripe\.com/i, /checkout\.stripe\.com/i, /stripe\.js/i] },
  { label: "PayPal", patterns: [/paypal\.com\/sdk/i, /paypalobjects\.com/i, /www\.paypal\.com/i] },
  { label: "Square", patterns: [/squareup\.com/i, /web\.squarecdn\.com/i] },
  { label: "Razorpay", patterns: [/checkout\.razorpay\.com/i, /razorpay/i] },
  { label: "Paystack", patterns: [/js\.paystack\.co/i, /paystack/i] },
  { label: "Flutterwave", patterns: [/checkout\.flutterwave\.com/i, /flutterwave/i] },
  { label: "FedaPay", patterns: [/fedapay/i] },
  { label: "Kkiapay", patterns: [/kkiapay/i] },
];

export type Assessment = {
  has_website: boolean;
  has_ssl: boolean;
  payment_platform_detected: string | null;
  signal_flags: string[];
  website: string | null;
};

export async function assessWebsite(website: string | null): Promise<Assessment> {
  if (!website) {
    return {
      has_website: false,
      has_ssl: false,
      payment_platform_detected: null,
      signal_flags: ["no_website", "no_payment_platform"],
      website: null,
    };
  }

  const hasSsl = website.startsWith("https://");
  const flags: string[] = [];
  if (!hasSsl) flags.push("no_ssl");

  let gateway: string | null = null;
  try {
    const res = await fetchWithTimeout(website, 8_000, {
      headers: { "user-agent": "SignalBot/1.0 (+site assessment)" },
      redirect: "follow",
    });
    if (!res.ok) {
      flags.push("site_unreachable");
    } else {
      const html = (await res.text()).slice(0, 400_000);
      gateway = GATEWAYS.find((g) => g.patterns.some((p) => p.test(html)))?.label ?? null;
    }
  } catch {
    flags.push("site_unreachable");
  }

  if (!gateway) flags.push("no_payment_platform");

  return {
    has_website: true,
    has_ssl: hasSsl,
    payment_platform_detected: gateway,
    signal_flags: flags,
    website,
  };
}

// ------------------------------------------------------------------ Gemini

export async function generatePitch(input: {
  name: string;
  industry: string | null;
  flags: string[];
  gateway: string | null;
}): Promise<string | null> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!geminiKey && !lovableKey) return null;

  const gaps =
    input.flags.length > 0
      ? input.flags
          .map(
            (f) =>
              ({
                no_website: "no website at all",
                no_ssl: "site is not served over HTTPS",
                no_payment_platform: "no online payment platform detected",
                site_unreachable: "website did not respond",
              })[f] ?? f,
          )
          .join("; ")
      : "no obvious technical gaps";

  const prompt = [
    "You write outbound pitches for a digital agency selling website builds,",
    "marketing/visibility outsourcing, and payment integration.",
    `Business: ${input.name}. Industry: ${input.industry ?? "unknown"}.`,
    `Detected gaps: ${gaps}.`,
    input.gateway ? `Payment platform in use: ${input.gateway}.` : "",
    "Write exactly two sentences, plain text, no greeting, no sign-off, no markdown.",
    "Sentence 1: name the most valuable gap and its business impact.",
    "Sentence 2: the concrete service we offer to close it.",
  ]
    .filter(Boolean)
    .join(" ");

  if (geminiKey) {
    const viaGemini = await pitchViaGemini(prompt, geminiKey);
    if (viaGemini) return viaGemini;
  }
  if (lovableKey) return pitchViaLovableAi(prompt, lovableKey);
  return null;
}

/** Google AI Studio (Gemini) — used first when GEMINI_API_KEY is set. */
async function pitchViaGemini(prompt: string, key: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      20_000,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
        }),
      },
    );

    if (!res.ok) {
      console.error("Gemini pitch failed", res.status, await res.text());
      return null;
    }

    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join(" ")
      .trim();
    return text && text.length > 0 ? text : null;
  } catch (error) {
    console.error("Gemini pitch error", error);
    return null;
  }
}

/**
 * Lovable AI Gateway fallback. Keeps pitch generation working when the Gemini
 * key is missing, restricted, rate-limited, or out of quota.
 */
async function pitchViaLovableAi(prompt: string, key: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      25_000,
      {
        method: "POST",
        headers: { "content-type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      },
    );

    if (!res.ok) {
      console.error("Lovable AI pitch failed", res.status, await res.text());
      return null;
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch (error) {
    console.error("Lovable AI pitch error", error);
    return null;
  }
}

// ------------------------------------------------------------------ scoring

export const EVENT_WEIGHTS: Record<string, number> = {
  page_view: 2,
  pricing_view: 15,
  download: 20,
  identify: 10,
};

export function intentScore(events: Array<{ event_type: string }>): number {
  const raw = events.reduce((sum, e) => sum + (EVENT_WEIGHTS[e.event_type] ?? 0), 0);
  return Math.min(100, raw);
}

export function totalScore(fit: number, intent: number): number {
  return Math.round(fit * 0.4 + intent * 0.6);
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

export function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
