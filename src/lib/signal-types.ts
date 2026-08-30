/** Client-safe shared shapes returned by the Signal server functions. */

export type SessionInfo = {
  id: string;
  name: string;
  intentThreshold: number;
  isAgency: boolean;
  createdAt: string;
};

export type BusinessCardData = {
  id: string;
  name: string;
  address: string | null;
  website: string | null;
  industry: string | null;
  hasWebsite: boolean | null;
  hasSsl: boolean | null;
  paymentPlatform: string | null;
  signalFlags: string[];
  pitch: string | null;
  status: string;
  assessedAt: string | null;
  convertedClientId: string | null;
};

export type ManagedClient = {
  id: string;
  name: string;
  apiKey: string;
  intentThreshold: number;
  createdAt: string;
};

export type LeadRow = {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  visitorId: string | null;
  fitScore: number;
  intentScore: number;
  totalScore: number;
  status: string;
  businessName: string | null;
  eventCount: number;
  lastSeen: string | null;
  qualified: boolean;
  createdAt: string;
};
