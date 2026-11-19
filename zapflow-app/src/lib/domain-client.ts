import { cleanDomain } from "./brand";
import type { DomainInfo } from "./domain-status";

type DomainRequest = { domain: string; action?: "verify" };

function requestSignal(timeoutMs: number, external?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external && typeof AbortSignal.any === "function" ? AbortSignal.any([external, timeout]) : timeout;
}

/** O navegador testa o endereço salvo sem enviar cookies nem o endereço de origem. */
async function checkHttps(info: DomainInfo, signal?: AbortSignal): Promise<DomainInfo> {
  if (!info.domain || (info.status !== "manual" && info.status !== "connected")) return info;
  const connected = { ...info, status: "connected" as const };
  if (window.location.protocol === "https:" && window.location.hostname === info.domain) return connected;
  if (info.project) {
    try {
      const response = await fetch(`https://${info.domain}/api/domain/check`, {
        credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store",
        signal: requestSignal(6500, signal),
      });
      if (response.ok && (await response.json())?.project === info.project) return connected;
    } catch {
      signal?.throwIfAborted();
    }
  }
  return { ...info, status: info.automatic ? "https" : "manual" };
}

export async function fetchDomainStatus(change?: DomainRequest, signal?: AbortSignal): Promise<DomainInfo> {
  let response: Response;
  try {
    response = await fetch("/api/domain", {
      ...(change && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }),
      cache: "no-store", signal: requestSignal(40_000, signal),
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error("Não foi possível falar com o painel. Confira sua conexão e tente novamente.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Não foi possível consultar o domínio. Tente novamente.");
  const validDomain = typeof data?.domain === "string" && data.domain !== "" && cleanDomain(data.domain) === data.domain;
  if (!data || !["none", "manual", "pending", "connected", "error"].includes(data.status)
    || (data.status === "none" ? data.domain !== null : !validDomain)) {
    throw new Error("O painel não conseguiu confirmar o estado do domínio. Tente verificar novamente.");
  }
  return checkHttps(data, signal);
}
