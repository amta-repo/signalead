import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ApiKeyInput = z.object({ apiKey: z.string().min(1) });

const SearchInput = z.object({
  apiKey: z.string().min(1),
  industry: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
});

const AssessInput = z.object({
  apiKey: z.string().min(1),
  businessId: z.string().uuid(),
});

const ConvertInput = z.object({
  apiKey: z.string().min(1),
  businessId: z.string().uuid(),
});

const ThresholdInput = z.object({
  apiKey: z.string().min(1),
  intentThreshold: z.number().int().min(0).max(200),
});

export const getSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApiKeyInput.parse(input))
  .handler(async ({ data }) => {
    const { loadSession } = await import("./signal-ops.server");
    return loadSession(data.apiKey);
  });

export const searchBusinesses = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const { runSearch } = await import("./signal-ops.server");
    return runSearch(data.apiKey, data.industry, data.location);
  });

export const assessBusiness = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssessInput.parse(input))
  .handler(async ({ data }) => {
    const { runAssessment } = await import("./signal-ops.server");
    return runAssessment(data.apiKey, data.businessId);
  });

export const convertToClient = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConvertInput.parse(input))
  .handler(async ({ data }) => {
    const { runConvert } = await import("./signal-ops.server");
    return runConvert(data.apiKey, data.businessId);
  });

export const listClients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApiKeyInput.parse(input))
  .handler(async ({ data }) => {
    const { runListClients } = await import("./signal-ops.server");
    return runListClients(data.apiKey);
  });

export const getLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApiKeyInput.parse(input))
  .handler(async ({ data }) => {
    const { runGetLeads } = await import("./signal-ops.server");
    return runGetLeads(data.apiKey);
  });

export const updateThreshold = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ThresholdInput.parse(input))
  .handler(async ({ data }) => {
    const { runUpdateThreshold } = await import("./signal-ops.server");
    return runUpdateThreshold(data.apiKey, data.intentThreshold);
  });
