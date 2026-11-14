"use client";

import { useMemo, useState } from "react";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { TaskRow, type OpenNew } from "@/components/features/task-sheets";
import { Button, Panel } from "@/components/ui/shared";
import { isOpen, localDate, localTime, taskState, toDateStr } from "@/lib/tasks";
import type { Task } from "@/types";
import { cn } from "@/lib/utils";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Cor do pontinho no calendário. */
function dotColor(t: Task) {
  const st = taskState(t);
  if (st === "overdue") return "var(--warn)";
  if (st === "failed") return "var(--hot)";
  if (t.kind === "send") return "var(--accent)";
  return t.color;
}

/** Visão de calendário das tarefas (mês + lista do dia). */
export function TaskCalendar({ tasks, isLoading, openNew, openTask }: {
  tasks: Task[];
  isLoading: boolean;
  openNew: OpenNew;
  openTask: (t: Task) => void;
}) {
  const todayStr = toDateStr(new Date());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selected, setSelected] = useState(todayStr);

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = localDate(t.due_at);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    for (const list of map.values()) list.sort((a, b) => a.due_at.localeCompare(b.due_at));
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(year, month, 1 - first + i);
      return { date: d, str: toDateStr(d), inMonth: d.getMonth() === month };
    });
  }, [month, year]);

  const monthKey = `${year}-${pad(month + 1)}`;
  const inMonth = tasks.filter((t) => localDate(t.due_at).startsWith(monthKey));
  const counts = {
    sends: inMonth.filter((t) => t.kind === "send").length,
    reminders: inMonth.filter((t) => t.kind === "reminder").length,
    open: inMonth.filter(isOpen).length,
  };

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  };
  const goToday = () => {
    const d = new Date();
    setMonth(d.getMonth());
    setYear(d.getFullYear());
    setSelected(todayStr);
  };

  const selDate = new Date(selected + "T12:00:00");
  const dayList = byDate.get(selected) ?? [];
  const isPastDay = selected < todayStr;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" aria-label="Mês anterior" onClick={() => step(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="secondary" size="icon" aria-label="Próximo mês" onClick={() => step(1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight min-w-[170px]">{MONTHS[month]} {year}</h2>
        <Button variant="secondary" onClick={goToday}>Hoje</Button>
        <p className="text-sm text-muted tabular-nums hidden md:block">
          {counts.sends} envios · {counts.reminders} lembretes · {counts.open} em aberto
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel className="p-4 sm:p-5" aria-label="Calendário">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_SHORT.map((d) => <div key={d} className="text-center text-xs font-semibold text-muted py-1.5">{d}</div>)}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">{Array.from({ length: 42 }, (_, i) => <span key={i} className="skeleton h-[60px] sm:h-[72px]" />)}</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {days.map(({ date, str, inMonth: im }) => {
                const list = byDate.get(str) ?? [];
                const isSel = str === selected;
                const isToday = str === todayStr;
                return (
                  <button
                    key={str}
                    type="button"
                    onClick={() => { setSelected(str); if (!im) { setMonth(date.getMonth()); setYear(date.getFullYear()); } }}
                    aria-label={`${date.getDate()} de ${MONTHS[date.getMonth()]}${list.length ? `, ${list.length} tarefas` : ""}`}
                    aria-pressed={isSel}
                    className={cn(
                      "h-[60px] sm:h-[72px] rounded-xl flex flex-col items-center justify-start pt-2 gap-1 cursor-pointer transition-colors border",
                      isSel ? "bg-primary text-on-primary border-primary" : "border-transparent hover:bg-surface",
                      !im && !isSel && "text-muted/60"
                    )}
                  >
                    <span className={cn("text-sm tabular-nums w-7 h-7 grid place-items-center rounded-full", isToday && !isSel && "bg-accent text-white font-semibold", isSel && "font-bold")}>{date.getDate()}</span>
                    {list.length > 0 && (
                      <span className="flex items-center gap-0.5" aria-hidden="true">
                        {list.slice(0, 3).map((t) => (
                          <span key={t.id} className={cn("w-1.5 h-1.5 rounded-full", !isOpen(t) && taskState(t) !== "failed" && "opacity-40")} style={{ backgroundColor: isSel ? "currentColor" : dotColor(t) }} />
                        ))}
                        {list.length > 3 && <span className="text-[10px] leading-none tabular-nums">+{list.length - 3}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" /> Envio</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-fg" /> Lembrete</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn" /> Atrasada</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-hot" /> Falhou</span>
          </div>
        </Panel>

        <Panel className="p-5 flex flex-col gap-4 lg:sticky lg:top-0" aria-label="Tarefas do dia">
          <div>
            <p className="text-sm text-muted">{DAYS_FULL[selDate.getDay()]}</p>
            <h3 className="font-display text-2xl font-bold tracking-tight">{selDate.getDate()} de {MONTHS[selDate.getMonth()]}</h3>
          </div>

          {dayList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center">
              <CalendarDays className="w-6 h-6 mx-auto text-muted mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold">Dia livre</p>
              <p className="text-sm text-muted mt-0.5">Nenhuma tarefa neste dia.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {dayList.map((t) => (
                <li key={t.id} className="flex gap-2 items-center">
                  <span className="w-11 text-xs font-semibold tabular-nums text-muted shrink-0">{localTime(t.due_at)}</span>
                  <div className="flex-1 min-w-0"><TaskRow task={t} onOpen={openTask} showDate={false} /></div>
                </li>
              ))}
            </ul>
          )}

          {!isPastDay && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => openNew({ date: selected, kind: "send" })}><Send className="w-4 h-4" /> Envio</Button>
              <Button variant="secondary" onClick={() => openNew({ date: selected, kind: "reminder" })}><Bell className="w-4 h-4" /> Lembrete</Button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
