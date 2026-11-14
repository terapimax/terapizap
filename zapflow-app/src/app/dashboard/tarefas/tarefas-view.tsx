"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Bell, CalendarDays, CheckCircle2, Info, List, ListChecks, Plus, Send } from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskSheets, TaskRow } from "@/components/features/task-sheets";
import { TaskCalendar } from "@/components/features/task-calendar";
import { Button, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { dayHeading, isOpen, localDate, taskState, toDateStr } from "@/lib/tasks";
import type { Task } from "@/types";
import { cn } from "@/lib/utils";

type View = "lista" | "calendario";
type Tab = "hoje" | "proximas" | "atrasadas" | "concluidas";
type KindFilter = "all" | "send" | "reminder";

const TABS: [Tab, string][] = [["hoje", "Hoje"], ["proximas", "Próximas"], ["atrasadas", "Atrasadas"], ["concluidas", "Concluídas"]];

const EMPTY: Record<Tab, { title: string; description: string }> = {
  hoje: { title: "Nada para hoje", description: "Agende um envio ou crie um lembrete para acompanhar seus leads." },
  proximas: { title: "Nenhuma tarefa futura", description: "Os envios e lembretes agendados para os próximos dias aparecem aqui." },
  atrasadas: { title: "Tudo em dia", description: "Nenhuma tarefa atrasada ou com falha." },
  concluidas: { title: "Nenhuma tarefa concluída ainda", description: "Envios feitos, lembretes concluídos e cancelados ficam guardados aqui." },
};

function tabOf(t: Task, today: string): Tab[] {
  const st = taskState(t);
  const day = localDate(t.due_at);
  const tabs: Tab[] = [];
  if (st === "overdue" || st === "failed") tabs.push("atrasadas");
  if (st === "sent" || st === "done" || st === "cancelled") tabs.push("concluidas");
  if (day === today && st !== "cancelled") tabs.push("hoje");
  if (isOpen(t) && day > today) tabs.push("proximas");
  return tabs;
}

export function TarefasView({ initialView }: { initialView: View }) {
  const { data: tasks = [], isLoading, isError } = useTasks();
  const { openNew, openTask, sheets } = useTaskSheets(tasks);
  const [view, setView] = useState<View>(initialView);
  const [tab, setTab] = useState<Tab>("hoje");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");

  const today = toDateStr(new Date());

  const { byTab, counts } = useMemo(() => {
    const byTab: Record<Tab, Task[]> = { hoje: [], proximas: [], atrasadas: [], concluidas: [] };
    for (const t of tasks) for (const k of tabOf(t, today)) byTab[k].push(t);
    byTab.concluidas.sort((a, b) => (b.finished_at ?? b.due_at).localeCompare(a.finished_at ?? a.due_at));
    return { byTab, counts: { hoje: byTab.hoje.filter(isOpen).length, proximas: byTab.proximas.length, atrasadas: byTab.atrasadas.length, concluidas: byTab.concluidas.length } };
  }, [tasks, today]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return byTab[tab].filter(
      (t) => (kind === "all" || t.kind === kind) && (!s || `${t.title} ${t.lead?.name ?? ""} ${t.contact ?? ""}`.toLowerCase().includes(s))
    );
  }, [byTab, tab, kind, q]);

  // agrupa por dia (concluídas já vêm da mais recente para a mais antiga)
  const groups = useMemo(() => {
    const out: { day: string; items: Task[] }[] = [];
    for (const t of list) {
      const day = localDate(tab === "concluidas" ? t.finished_at ?? t.due_at : t.due_at);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(t);
      else out.push({ day, items: [t] });
    }
    return out;
  }, [list, tab]);

  const hasSends = tasks.some((t) => t.kind === "send" && isOpen(t));

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Não foi possível carregar as tarefas"
        description="Se você acabou de atualizar o ZapFlow, rode o arquivo supabase/tarefas.sql no Supabase para criar a tabela de tarefas."
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-5 animate-fade-in w-full mx-auto", view === "calendario" ? "max-w-[1240px]" : "max-w-[960px]")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="radiogroup" aria-label="Visão" className="flex gap-1 p-1 rounded-xl bg-surface">
          {([["lista", "Lista", List], ["calendario", "Calendário", CalendarDays]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}
              className={cn("h-9 px-3.5 rounded-[9px] text-sm flex items-center gap-1.5 cursor-pointer transition-colors",
                view === id ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={() => openNew({ kind: "send" })}><Plus className="w-4 h-4" /> Nova tarefa</Button>
      </div>

      {view === "calendario" ? (
        <TaskCalendar tasks={tasks} isLoading={isLoading} openNew={openNew} openTask={openTask} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="Tarefas" className="flex gap-1 p-1 rounded-xl bg-surface overflow-x-auto">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-9 px-3.5 rounded-[9px] text-sm flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap",
                tab === id ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg"
              )}
            >
              {label}
              {counts[id] > 0 && id !== "concluidas" && (
                <span className={cn("min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold grid place-items-center tabular-nums",
                  id === "atrasadas" ? "bg-warn-soft text-warn" : "bg-line/60 text-fg")}>
                  {counts[id]}
                </span>
              )}
            </button>
          ))}
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por lead ou tarefa" />
          <div role="radiogroup" aria-label="Tipo" className="flex gap-1.5">
            {([["all", "Todas", ListChecks], ["send", "Envios", Send], ["reminder", "Lembretes", Bell]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
                className={cn("h-10 px-3 rounded-[10px] border text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors",
                  kind === id ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {hasSends && (
          <p className="flex gap-2.5 items-start text-sm rounded-xl bg-cold-soft text-cold p-3.5">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Seus envios ficam salvos e prontos. O envio automático pela extensão chega na próxima atualização. Até lá, envios que passarem do horário aparecem como <b>Atrasados</b>.</span>
          </p>
        )}

      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-[66px]" />)}</div>
      ) : list.length === 0 ? (
        <Panel className="p-2">
          <EmptyState
            icon={tab === "atrasadas" || tab === "concluidas" ? CheckCircle2 : ListChecks}
            title={q || kind !== "all" ? "Nada encontrado" : EMPTY[tab].title}
            description={q || kind !== "all" ? "Tente outra busca ou outro filtro." : EMPTY[tab].description}
            action={tab === "hoje" || tab === "proximas" ? <Button onClick={() => openNew({ kind: "send" })}><Plus className="w-4 h-4" /> Nova tarefa</Button> : undefined}
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.day} aria-label={dayHeading(g.day)} className="flex flex-col gap-2">
              {tab !== "hoje" && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted first-letter:uppercase">{dayHeading(g.day)}</h3>}
              <ul className="flex flex-col gap-2">
                {g.items.map((t) => <li key={t.id}><TaskRow task={t} onOpen={openTask} showDate={tab !== "concluidas"} /></li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
        </>
      )}

      {sheets}
    </div>
  );
}
