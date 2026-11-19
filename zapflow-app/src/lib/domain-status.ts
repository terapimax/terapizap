export interface DomainInfo {
  domain: string | null;
  automatic: boolean;
  status: "none" | "connected" | "pending" | "manual" | "https" | "error";
  project?: string;
  record?: { type: string; name: string; value: string };
  verification?: { type: string; name: string; value: string }[];
  message?: string;
}

// Identificador público da instalação. O teste de acesso nunca precisa de uma credencial.
export const domainProject = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_PRODUCTION_URL
  || process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
