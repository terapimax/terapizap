import { domainProject } from "@/lib/domain-status";

export function GET() {
  return Response.json({ project: domainProject ?? null }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}
