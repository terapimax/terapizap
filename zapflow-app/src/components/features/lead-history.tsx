"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, FileText, Image as ImageIcon, MapPin, MessageCircle, Mic, Smile, User, Video, Zap } from "lucide-react";
import { Button } from "@/components/ui/shared";
import { useClearLeadMessages, useLeadMessages } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
import type { LeadFull, LeadMessage } from "@/types";

const KIND: Record<LeadMessage["kind"], { label: string; icon: typeof Mic } | null> = {
  text: null,
  audio: { label: "Áudio", icon: Mic },
  image: { label: "Foto", icon: ImageIcon },
  video: { label: "Vídeo", icon: Video },
  document: { label: "Documento", icon: FileText },
  sticker: { label: "Figurinha", icon: Smile },
  location: { label: "Localização", icon: MapPin },
  contact: { label: "Contato", icon: User },
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Aba Histórico da ficha: a conversa guardada pela extensão (se o histórico estiver ligado). */
export function LeadHistory({ lead, origin }: { lead: LeadFull; origin: string }) {
  const { data: messages = [], isLoading } = useLeadMessages(lead.id);
  const clear = useClearLeadMessages();
  const [confirm, setConfirm] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const created = lead.created_at ? new Date(lead.created_at) : null;

  // separa por dia
  const days = useMemo(() => {
    const out: { label: string; items: LeadMessage[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.at);
      if (out.at(-1)?.label !== label) out.push({ label, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [messages]);

  // abre já no fim da conversa (a mensagem mais nova)
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  return (
    <div className="flex flex-col gap-5">
      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <span key={i} className={cn("skeleton h-12 w-3/4", i % 2 && "self-end")} />)}</div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-5 text-sm">
          <p className="font-semibold flex items-center gap-2"><MessageCircle className="w-4 h-4 text-muted" /> Nenhuma conversa guardada</p>
          <p className="text-muted mt-1">
            Para ver as conversas aqui, ligue <b className="text-fg">Guardar histórico de conversas</b> na extensão (Ajustes → Leads) e abra a conversa deste lead no WhatsApp Web.
            Ficam guardadas as últimas 50 mensagens, por 90 dias.
          </p>
          {lead.last_message && (
            <div className="mt-3">
              <p className="text-xs text-muted">Última mensagem recebida{lead.last_contact_at ? ` · ${new Date(lead.last_contact_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
              <p className="mt-1 bg-surface rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{lead.last_message}</p>
            </div>
          )}
        </div>
      ) : (
        <section aria-label="Conversa" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Conversa · {messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}</h4>
            {confirm ? (
              <span className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Manter</Button>
                <Button size="sm" variant="danger" onClick={() => clear.mutate(lead.id, { onSuccess: () => setConfirm(false) })}>Apagar</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Apagar histórico</Button>
            )}
          </div>
          {days.map((d) => (
            <div key={d.label} className="flex flex-col gap-1.5">
              <p className="self-center my-2 px-2.5 py-0.5 rounded-full bg-surface text-[11px] font-semibold text-muted">{d.label}</p>
              {d.items.map((m) => {
                const kind = KIND[m.kind];
                const Icon = kind?.icon;
                return (
                  <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from_me ? "self-end bg-primary text-on-primary rounded-br-md" : "self-start bg-surface text-fg rounded-bl-md")}>
                    {kind && Icon && (
                      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", m.body && "mb-1")}><Icon className="w-3.5 h-3.5" aria-hidden="true" /> {kind.label}</p>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className={cn("mt-1 text-[10px] flex items-center gap-1 justify-end tabular-nums", m.from_me ? "opacity-70" : "text-muted")}>
                      {m.by_zapflow && <span className="inline-flex items-center gap-0.5 font-semibold" title="Enviada pelo ZapFlow (funil, gatilho ou tarefa)"><Zap className="w-3 h-3" aria-hidden="true" /> ZapFlow ·</span>}
                      {time(m.at)}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={endRef} />
        </section>
      )}

      <div className="flex gap-3 pt-2 border-t border-line">
        <span className="w-8 h-8 rounded-full bg-surface grid place-items-center text-muted shrink-0"><CalendarPlus className="w-4 h-4" /></span>
        <div>
          <p className="text-sm font-semibold">Lead criado</p>
          <p className="text-xs text-muted">
            {created ? created.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "Data não registrada"}
            {origin ? ` · origem: ${origin}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
