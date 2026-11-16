"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, CalendarDays, Filter, MessageSquareText, Mic, Image as ImageIcon, FileText, Users } from "lucide-react";
import { useBoards, useBoardData } from "@/hooks/use-kanban";
import { useFunnels } from "@/hooks/use-funnels";
import { useTasks } from "@/hooks/use-tasks";
import { formatDue, isOpen, localDate, stateLabel } from "@/lib/tasks";
import { TaskIcon } from "@/components/features/task-sheets";
import { useMessages } from "@/hooks/use-messages";
import { useAllMedia } from "@/hooks/use-media";
import { Panel, Chip, EmptyState } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import { resolveOutcomes } from "@/lib/reports";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

const STEP_ICON = { message: MessageSquareText, audio: Mic, midia: ImageIcon, document: FileText } as const;

export default function DashboardPage() {
  const boards = useBoards();
  const boardId = boards.data?.[0]?.id ?? null;
  const board = useBoardData(boardId);
  const funnels = useFunnels();
  const tasks = useTasks();
  const messages = useMessages();
  const media = useAllMedia();

  const columns = useMemo(() => board.data ?? [], [board.data]);
  const loading = boards.isLoading || (!!boardId && board.isLoading);
  const failed = boards.isError || board.isError;

  const stats = useMemo(() => {
    const all = columns.flatMap((c) => c.items);
    // etapas de resultado: as marcadas no Kanban (ou, sem marcação, pelo nome: "Fechados", "Perdidos"…)
    const { map: outcomes } = resolveOutcomes(columns);
    const open = all.filter((l) => !outcomes.has(l.column_id));
    const won = all.filter((l) => outcomes.get(l.column_id) === "won");
    const maxCount = Math.max(1, ...columns.map((c) => c.items.length));
    return {
      total: all.length,
      openValue: open.reduce((a, l) => a + (Number(l.value) || 0), 0),
      wonCount: won.length,
      wonValue: won.reduce((a, l) => a + (Number(l.value) || 0), 0),
      conversion: all.length ? (won.length / all.length) * 100 : 0,
      hot: all.filter((l) => l.lead.status === "hot").length,
      hasWonStage: [...outcomes.values()].includes("won"),
      stages: columns.map((c) => ({
        id: c.id,
        title: c.title,
        count: c.items.length,
        value: c.items.reduce((a, l) => a + (Number(l.value) || 0), 0),
        width: (c.items.length / maxCount) * 100,
        won: outcomes.get(c.id) === "won",
      })),
    };
  }, [columns]);

  // em aberto, das atrasadas para as próximas (a lista já vem ordenada por horário)
  const upcoming = (tasks.data ?? []).filter(isOpen).slice(0, 5);
  const libraryCount = (messages.data?.length ?? 0) + (media.data?.length ?? 0);

  if (failed) {
    return (
      <Panel className="p-2">
        <EmptyState
          icon={AlertCircle}
          title="Não foi possível carregar seus dados"
          description="O banco de dados não respondeu. Verifique se o projeto no Supabase está ativo e recarregue a página."
        />
      </Panel>
    );
  }

  const kpis = [
    { label: "Leads no funil", value: String(stats.total), note: stats.hot ? `${stats.hot} quentes` : "nenhum quente agora" },
    { label: "Valor em negociação", value: brl(stats.openValue), note: "soma dos leads em aberto" },
    {
      label: "Taxa de conversão",
      value: stats.hasWonStage ? pct(stats.conversion) : "—",
      note: stats.hasWonStage ? `${stats.wonCount} fechados · ${brl(stats.wonValue)}` : "marque a etapa de ganho no Kanban",
    },
    { label: "Itens na biblioteca", value: String(libraryCount), note: `${funnels.data?.length ?? 0} funis criados` },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-[1240px] w-full mx-auto animate-fade-in">
      <section aria-label="Indicadores" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
        {kpis.map((k) => (
          <Panel key={k.label} className="p-5 flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-muted">{k.label}</span>
            {loading ? (
              <span className="skeleton h-8 w-28" />
            ) : (
              <span className="font-display text-[32px] leading-none font-bold tracking-tight tabular-nums">{k.value}</span>
            )}
            <span className="text-[13px] text-muted">{k.note}</span>
          </Panel>
        ))}
      </section>

      <div className="flex flex-wrap gap-4">
        <Panel aria-labelledby="h-funil" className="flex-[3_1_420px] min-w-0 p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="h-funil" className="text-base font-semibold">Funil de vendas</h2>
            <div className="flex items-center gap-4">
              <Link href="/dashboard/relatorios" className="text-[13px] font-semibold text-accent-fg hover:underline">Relatórios</Link>
              <Link href="/dashboard/kanban" className="text-[13px] font-semibold text-accent-fg hover:underline">Abrir Kanban</Link>
            </div>
          </div>
          {loading ? (
            <div className="flex flex-col gap-4">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-9" />)}</div>
          ) : stats.stages.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma etapa criada ainda. Monte seu funil na tela Kanban.</p>
          ) : (
            stats.stages.map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium truncate">{s.title}</span>
                  <span className="text-muted tabular-nums whitespace-nowrap">{s.count} leads · {brl(s.value)}</span>
                </div>
                <div className="h-2.5 rounded-md bg-surface overflow-hidden">
                  <div className={cn("h-full rounded-md", s.won ? "bg-accent" : "bg-fg")} style={{ width: `${s.width}%` }} />
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel aria-labelledby="h-agenda" className="flex-[2_1_300px] min-w-0 p-6 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 id="h-agenda" className="text-base font-semibold">Próximas tarefas</h2>
            <Link href="/dashboard/tarefas" className="text-[13px] font-semibold text-accent-fg hover:underline">Ver tarefas</Link>
          </div>
          {tasks.isLoading ? (
            [0, 1, 2].map((i) => <span key={i} className="skeleton h-12" />)
          ) : upcoming.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-sm text-muted">
              <CalendarDays className="w-5 h-5 shrink-0" aria-hidden="true" />
              Nenhuma tarefa em aberto. Agende envios pelo card do lead.
            </div>
          ) : (
            upcoming.map((t) => {
              const st = stateLabel(t);
              const day = localDate(t.due_at);
              return (
                <Link key={t.id} href="/dashboard/tarefas" className="flex items-center gap-3 py-2.5 border-b border-line last:border-0 hover:bg-surface -mx-2 px-2 rounded-lg">
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[11px] uppercase tracking-wide text-muted">
                      {new Date(day + "T12:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                    </div>
                    <div className="font-display text-lg font-bold leading-none tabular-nums">{day.slice(8, 10)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5"><TaskIcon task={t} className="w-3.5 h-3.5 shrink-0 text-muted" /> {t.title}</p>
                    <p className="text-xs text-muted truncate">{[t.lead?.name ?? t.contact, formatDue(t.due_at).split(" ").pop()].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </Link>
              );
            })
          )}
        </Panel>
      </div>

      <Panel aria-labelledby="h-funis" className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id="h-funis" className="text-base font-semibold">Funis</h2>
          <Link href="/dashboard/funis" className="text-[13px] font-semibold text-accent-fg hover:underline">Ver todos</Link>
        </div>
        {funnels.isLoading ? (
          <div className="px-6 pb-6 flex flex-col gap-3">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-10" />)}</div>
        ) : (funnels.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Filter}
            title="Nenhum funil ainda"
            description="Crie uma sequência de mensagens e áudios com digitando e gravando automáticos."
            action={<Link href="/dashboard/funis" className="h-10 px-4 rounded-[10px] bg-primary text-on-primary text-sm font-semibold inline-flex items-center">Criar funil</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="px-6 py-2.5 font-semibold border-t border-line">Funil</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold border-t border-line">Passos</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold border-t border-line">Conteúdo</th>
                  <th scope="col" className="px-6 py-2.5 font-semibold border-t border-line">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {funnels.data!.slice(0, 6).map((f) => {
                  const kinds = Array.from(new Set(f.items.map((i) => i.type)));
                  return (
                    <tr key={f.id} className="hover:bg-surface">
                      <td className="px-6 py-3.5 border-t border-line font-semibold">
                        <Link href="/dashboard/funis" className="hover:underline">{f.title}</Link>
                      </td>
                      <td className="px-3 py-3.5 border-t border-line tabular-nums">{f.items.length}</td>
                      <td className="px-3 py-3.5 border-t border-line">
                        <div className="flex gap-1.5">
                          {kinds.length === 0 ? <Chip>vazio</Chip> : kinds.map((k) => {
                            const Icon = STEP_ICON[k];
                            return <span key={k} className="w-7 h-7 rounded-lg bg-surface grid place-items-center" title={k}><Icon className="w-3.5 h-3.5" /></span>;
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 border-t border-line text-muted tabular-nums">{new Date(f.created_at).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {!loading && stats.total === 0 && (
        <Panel className="p-2">
          <EmptyState
            icon={Users}
            title="Seu funil está vazio"
            description="Adicione o primeiro lead para acompanhar valores e conversão aqui."
            action={<Link href="/dashboard/kanban" className="h-10 px-4 rounded-[10px] bg-primary text-on-primary text-sm font-semibold inline-flex items-center">Ir para o Kanban</Link>}
          />
        </Panel>
      )}
    </div>
  );
}
