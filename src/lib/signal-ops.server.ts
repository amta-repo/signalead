import { getDb } from "./db.server";
import {
  assessWebsite,
  emailDomain,
  generatePitch,
  hostFromUrl,
  intentScore,
  newApiKey,
  placeDetailsWebsite,
  placesTextSearch,
  requireClient,
  SignalError,
  totalScore,
  type BusinessRow,
} from "./signal.server";
import type {
  BusinessCardData,
  LeadRow,
  ManagedClient,
  SessionInfo,
} from "./signal-types";


function toCard(row: BusinessRow): BusinessCardData {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    website: row.website,
    industry: row.industry,
    hasWebsite: row.has_website,
    hasSsl: row.has_ssl,
    paymentPlatform: row.payment_platform_detected,
    signalFlags: row.signal_flags ?? [],
    pitch: row.pitch_suggestion,
    status: row.status,
    assessedAt: row.assessed_at,
    convertedClientId: row.converted_client_id,
  };
}

const BUSINESS_COLUMNS =
  "id, client_id, place_id, name, address, website, lat, lng, industry, has_website, has_ssl, payment_platform_detected, signal_flags, pitch_suggestion, assessed_at, status, converted_client_id";

export async function loadSession(apiKey: string): Promise<SessionInfo> {
  const client = await requireClient(apiKey);
  return {
    id: client.id,
    name: client.name,
    intentThreshold: client.intent_threshold,
    isAgency: client.parent_client_id === null,
    createdAt: client.created_at,
  };
}

export async function runSearch(
  apiKey: string,
  industry: string,
  location: string,
): Promise<BusinessCardData[]> {
  const client = await requireClient(apiKey);
  const db = getDb();
  const results = await placesTextSearch(`${industry} in ${location}`);
  if (results.length === 0) return [];

  const rows = results.map((r) => ({
    client_id: client.id,
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address ?? null,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    industry,
    source: "google_places",
  }));

  const { error } = await db
    .from("businesses")
    .upsert(rows, { onConflict: "client_id,place_id", ignoreDuplicates: true });
  if (error) throw new SignalError(`Could not save results: ${error.message}`);

  const { data, error: readError } = await db
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("client_id", client.id)
    .in(
      "place_id",
      results.map((r) => r.place_id),
    );
  if (readError) throw new SignalError(`Could not read results: ${readError.message}`);

  const byPlace = new Map((data as BusinessRow[]).map((row) => [row.place_id, row]));
  return results
    .map((r) => byPlace.get(r.place_id))
    .filter((row): row is BusinessRow => Boolean(row))
    .map(toCard);
}

export async function runAssessment(
  apiKey: string,
  businessId: string,
): Promise<BusinessCardData> {
  const client = await requireClient(apiKey);
  const db = getDb();

  const { data: business, error } = await db
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("id", businessId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (error) throw new SignalError(`Database error: ${error.message}`);
  if (!business) throw new SignalError("Business not found for this client.");

  const row = business as BusinessRow;
  let website = row.website;
  if (!website && row.place_id) {
    website = await placeDetailsWebsite(row.place_id);
  }

  const assessment = await assessWebsite(website);
  const pitch = await generatePitch({
    name: row.name,
    industry: row.industry,
    flags: assessment.signal_flags,
    gateway: assessment.payment_platform_detected,
  });

  const { data: updated, error: updateError } = await db
    .from("businesses")
    .update({
      website: assessment.website,
      has_website: assessment.has_website,
      has_ssl: assessment.has_ssl,
      payment_platform_detected: assessment.payment_platform_detected,
      signal_flags: assessment.signal_flags,
      pitch_suggestion: pitch,
      assessed_at: new Date().toISOString(),
      status: row.status === "client" ? "client" : "assessed",
    })
    .eq("id", row.id)
    .eq("client_id", client.id)
    .select(BUSINESS_COLUMNS)
    .single();
  if (updateError) throw new SignalError(`Could not save assessment: ${updateError.message}`);

  return toCard(updated as BusinessRow);
}

export async function runConvert(
  apiKey: string,
  businessId: string,
): Promise<{ clientName: string; apiKey: string; business: BusinessCardData }> {
  const agency = await requireClient(apiKey);
  if (agency.parent_client_id !== null) {
    throw new SignalError("Only your agency account can convert prospects into clients.");
  }
  const db = getDb();

  const { data: business, error } = await db
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("id", businessId)
    .eq("client_id", agency.id)
    .maybeSingle();
  if (error) throw new SignalError(`Database error: ${error.message}`);
  if (!business) throw new SignalError("Business not found for this client.");

  const row = business as BusinessRow;
  if (row.converted_client_id) {
    const { data: existing } = await db
      .from("clients")
      .select("name, api_key")
      .eq("id", row.converted_client_id)
      .maybeSingle();
    if (existing) {
      return {
        clientName: existing.name as string,
        apiKey: existing.api_key as string,
        business: toCard(row),
      };
    }
  }

  const { data: created, error: createError } = await db
    .from("clients")
    .insert({ name: row.name, api_key: newApiKey(), parent_client_id: agency.id })
    .select("id, name, api_key")
    .single();
  if (createError) throw new SignalError(`Could not create client: ${createError.message}`);

  const { data: linked, error: linkError } = await db
    .from("businesses")
    .update({ converted_client_id: created.id as string, status: "client" })
    .eq("id", row.id)
    .eq("client_id", agency.id)
    .select(BUSINESS_COLUMNS)
    .single();
  if (linkError) throw new SignalError(`Could not link client: ${linkError.message}`);

  return {
    clientName: created.name as string,
    apiKey: created.api_key as string,
    business: toCard(linked as BusinessRow),
  };
}


export async function runListClients(apiKey: string): Promise<ManagedClient[]> {
  const client = await requireClient(apiKey);
  const { data, error } = await getDb()
    .from("clients")
    .select("id, name, api_key, intent_threshold, created_at")
    .eq("parent_client_id", client.id)
    .order("created_at", { ascending: false });
  if (error) throw new SignalError(`Database error: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    apiKey: row.api_key as string,
    intentThreshold: row.intent_threshold as number,
    createdAt: row.created_at as string,
  }));
}


export async function runGetLeads(
  apiKey: string,
): Promise<{ leads: LeadRow[]; intentThreshold: number }> {
  const client = await requireClient(apiKey);
  const db = getDb();

  const [leadsRes, eventsRes] = await Promise.all([
    db
      .from("leads")
      .select(
        "id, visitor_id, contact_name, contact_email, fit_score, status, created_at, businesses(name)",
      )
      .eq("client_id", client.id),
    db
      .from("intent_events")
      .select("visitor_id, event_type, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20_000),
  ]);

  if (leadsRes.error) throw new SignalError(`Database error: ${leadsRes.error.message}`);
  if (eventsRes.error) throw new SignalError(`Database error: ${eventsRes.error.message}`);

  const grouped = new Map<string, Array<{ event_type: string; created_at: string }>>();
  for (const event of eventsRes.data ?? []) {
    const key = event.visitor_id as string;
    const list = grouped.get(key) ?? [];
    list.push({ event_type: event.event_type as string, created_at: event.created_at as string });
    grouped.set(key, list);
  }

  const leads: LeadRow[] = (leadsRes.data ?? []).map((row) => {
    const events = grouped.get((row.visitor_id as string) ?? "") ?? [];
    const intent = intentScore(events);
    const fit = (row.fit_score as number) ?? 50;
    const total = totalScore(fit, intent);
    const business = row.businesses as { name?: string } | { name?: string }[] | null;
    const businessName = Array.isArray(business)
      ? business[0]?.name ?? null
      : business?.name ?? null;

    return {
      id: row.id as string,
      contactName: (row.contact_name as string) ?? null,
      contactEmail: (row.contact_email as string) ?? null,
      visitorId: (row.visitor_id as string) ?? null,
      fitScore: fit,
      intentScore: intent,
      totalScore: total,
      status: row.status as string,
      businessName,
      eventCount: events.length,
      lastSeen: events[0]?.created_at ?? null,
      qualified: total >= client.intent_threshold,
      createdAt: row.created_at as string,
    };
  });

  leads.sort((a, b) => b.totalScore - a.totalScore);
  return { leads, intentThreshold: client.intent_threshold };
}

export async function runUpdateThreshold(
  apiKey: string,
  intentThreshold: number,
): Promise<{ intentThreshold: number }> {
  const client = await requireClient(apiKey);
  const { data, error } = await getDb()
    .from("clients")
    .update({ intent_threshold: intentThreshold })
    .eq("id", client.id)
    .select("intent_threshold")
    .single();
  if (error) throw new SignalError(`Could not update threshold: ${error.message}`);
  return { intentThreshold: data.intent_threshold as number };
}

// ------------------------------------------------------------ track events

export async function recordEvent(payload: {
  apiKey: string;
  visitorId: string;
  eventType: string;
  url: string | null;
  meta: Record<string, unknown>;
}): Promise<{ ok: true }> {
  const client = await requireClient(payload.apiKey);
  const db = getDb();

  const { error } = await db.from("intent_events").insert({
    client_id: client.id,
    visitor_id: payload.visitorId,
    event_type: payload.eventType,
    url: payload.url,
    meta: payload.meta,
  });
  if (error) throw new SignalError(`Could not record event: ${error.message}`);

  // Every tracked visitor becomes a lead row immediately, so anonymous traffic
  // is still ranked by intent. Identification later enriches the same row.
  const { data: existing, error: existingError } = await db
    .from("leads")
    .select("id, contact_email")
    .eq("client_id", client.id)
    .eq("visitor_id", payload.visitorId)
    .limit(1);
  if (existingError) throw new SignalError(`Could not read lead: ${existingError.message}`);

  let leadId = existing?.[0]?.id as string | undefined;
  if (!leadId) {
    const { data: created, error: createError } = await db
      .from("leads")
      .insert({ client_id: client.id, visitor_id: payload.visitorId })
      .select("id")
      .single();
    // A concurrent event may have created it first; re-read instead of failing.
    if (createError) {
      const { data: retry } = await db
        .from("leads")
        .select("id")
        .eq("client_id", client.id)
        .eq("visitor_id", payload.visitorId)
        .limit(1);
      leadId = retry?.[0]?.id as string | undefined;
      if (!leadId) throw new SignalError(`Could not save lead: ${createError.message}`);
    } else {
      leadId = created.id as string;
    }
  }

  const email = typeof payload.meta["email"] === "string" ? payload.meta["email"].trim() : "";
  if (payload.eventType === "identify" && email) {
    const name = typeof payload.meta["name"] === "string" ? payload.meta["name"] : null;
    const domain = emailDomain(email);

    let businessId: string | null = null;
    if (domain) {
      const { data: candidates } = await db
        .from("businesses")
        .select("id, website")
        .eq("client_id", client.id)
        .not("website", "is", null)
        .limit(500);
      businessId =
        (candidates ?? []).find((b) => hostFromUrl(b.website as string) === domain)?.id ?? null;
    }

    const { error: leadError } = await db
      .from("leads")
      .update({
        business_id: businessId,
        contact_name: name,
        contact_email: email.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Unique (client_id, contact_email): this person already has a lead row
    // under a different visitor id. Keep the identified row and drop the dupe.
    if (leadError) {
      if (leadError.code === "23505") {
        await db.from("leads").delete().eq("id", leadId);
      } else {
        throw new SignalError(`Could not save lead: ${leadError.message}`);
      }
    }
  } else {
    await db.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  }

  return { ok: true };
}


// ------------------------------------------------------- first-run bootstrap

/**
 * Creates the agency account (parent_client_id = null) the very first time the
 * console is used. Refuses once any agency row exists, so it cannot be used to
 * mint extra owner accounts later.
 */
export async function runBootstrapAgency(
  name: string,
): Promise<{ name: string; apiKey: string }> {
  const db = getDb();

  const { data: existing, error } = await db
    .from("clients")
    .select("id")
    .is("parent_client_id", null)
    .limit(1);
  if (error) throw new SignalError(`Database error: ${error.message}`);
  if ((existing ?? []).length > 0) {
    throw new SignalError(
      "An agency account already exists. Paste its key instead of creating a new one.",
    );
  }

  const { data: created, error: createError } = await db
    .from("clients")
    .insert({ name: name.trim() || "My Agency", api_key: newApiKey("sk_agency"), parent_client_id: null })
    .select("name, api_key")
    .single();
  if (createError) throw new SignalError(`Could not create agency: ${createError.message}`);

  return { name: created.name as string, apiKey: created.api_key as string };
}

export async function runAgencyExists(): Promise<{ exists: boolean }> {
  const { data, error } = await getDb()
    .from("clients")
    .select("id")
    .is("parent_client_id", null)
    .limit(1);
  if (error) throw new SignalError(`Database error: ${error.message}`);
  return { exists: (data ?? []).length > 0 };
}
