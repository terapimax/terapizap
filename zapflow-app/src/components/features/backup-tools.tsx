"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileArchive, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/shared";
import { Sheet } from "@/components/ui/modal";
import { createBackup, openBackup, restoreBackup, summarize, type Progress, type RestoreMode, type RestoreReport } from "@/lib/backup/engine";
import { fmtBytes, type BackupSource, type TableName } from "@/lib/backup/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const supabase = createClient();

function ProgressBar({ p }: { p: Progress | null }) {
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex justify-between gap-3 text-xs text-muted">
        <span>{p?.label ?? "Preparando"}…</span>
        {p && p.total > 1 && <span className="tabular-nums">{p.done} de {p.total}</span>}
      </div>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

/** Evita fechar a aba no meio do processo. */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [active]);
}

const REPORT_LABELS: Record<TableName, string> = {
  messages: "Mensagens", media_library: "Áudios, mídias e documentos", funnels: "Funis", funnel_items: "Passos de funil",
  kanban_boards: "Quadros", kanban_columns: "Etapas", tags: "Etiquetas", leads: "Leads", lead_tags: "Etiquetas nos leads", kanban_cards: "Cards do Kanban", triggers: "Gatilhos", appointments: "Agenda antiga", tasks: "Tarefas",
};

export function BackupTools() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // backup
  const [includeFiles, setIncludeFiles] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [bProgress, setBProgress] = useState<Progress | null>(null);
  const [bResult, setBResult] = useState<{ filename: string; size: number; files: number; failed: string[] } | null>(null);

  // restauração
  const [reading, setReading] = useState(false);
  const [source, setSource] = useState<{ src: BackupSource; fileName: string; fileSize: number } | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [agree, setAgree] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [rProgress, setRProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);

  useLeaveGuard(backingUp || restoring);

  const doBackup = async () => {
    setBackingUp(true);
    setBResult(null);
    setBProgress(null);
    try {
      const r = await createBackup(supabase, { includeFiles }, setBProgress);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.blob);
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setBResult({ filename: r.filename, size: r.blob.size, files: r.files, failed: r.failedFiles });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBackingUp(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      // dá tempo do aviso "Lendo…" aparecer antes de um arquivo grande travar a tela por alguns segundos
      await new Promise((r) => setTimeout(r, 50));
      const src = await openBackup(file);
      setSource({ src, fileName: file.name, fileSize: file.size });
      setMode("merge");
      setAgree(false);
      setReport(null);
      setRProgress(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doRestore = async () => {
    if (!source) return;
    setRestoring(true);
    setReport(null);
    try {
      const r = await restoreBackup(supabase, source.src, mode, setRProgress);
      setReport(r);
      qc.invalidateQueries();
      if (r.ok) toast.success("Backup restaurado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  const closeSheet = () => { if (!restoring) setSource(null); };

  const summary = source ? summarize(source.src).filter((s) => s.n > 0) : [];
  const total = (r: Partial<Record<TableName, number>>) => Object.values(r).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* FAZER BACKUP */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-line">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0" aria-hidden="true"><Download className="w-4 h-4" /></span>
          <div>
            <h3 className="font-sans text-sm font-semibold tracking-normal">Fazer backup</h3>
            <p className="text-xs text-muted mt-0.5">Baixa um arquivo .zip com mensagens, áudios, mídias, documentos, funis, gatilhos, leads e tarefas.</p>
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} disabled={backingUp} className="mt-0.5 w-4 h-4 accent-[var(--fg)] cursor-pointer" />
          <span>
            Incluir os arquivos
            <span className="block text-xs text-muted">Sem eles o backup fica pequeno, mas áudios e mídias dependem dos links continuarem existindo.</span>
          </span>
        </label>
        {backingUp && <ProgressBar p={bProgress} />}
        {bResult && !backingUp && (
          <div className={cn("text-xs rounded-[10px] p-3", bResult.failed.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
            <p className="font-semibold">Backup salvo em Downloads: {bResult.filename} ({fmtBytes(bResult.size)}, {bResult.files} arquivo{bResult.files === 1 ? "" : "s"}).</p>
            {bResult.failed.length > 0 && <p className="mt-1">Não consegui baixar: {bResult.failed.slice(0, 5).join(", ")}{bResult.failed.length > 5 ? ` e mais ${bResult.failed.length - 5}` : ""}. Eles ficam só com o link.</p>}
          </div>
        )}
        <div className="mt-auto">
          <Button onClick={doBackup} disabled={backingUp}>
            {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {backingUp ? "Gerando backup" : "Baixar backup"}
          </Button>
        </div>
      </div>

      {/* RESTAURAR */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-line">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0" aria-hidden="true"><Upload className="w-4 h-4" /></span>
          <div>
            <h3 className="font-sans text-sm font-semibold tracking-normal">Restaurar backup</h3>
            <p className="text-xs text-muted mt-0.5">Aceita o .zip do ZapFlow e também o backup .json do ZapVoice. Antes de gravar, mostra o que tem dentro.</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pickFile(e.target.files?.[0])} />
        <div className="mt-auto">
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={reading || restoring}>
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} {reading ? "Lendo arquivo" : "Escolher arquivo"}
          </Button>
          {reading && <p className="text-xs text-muted mt-2">Arquivos grandes levam alguns segundos.</p>}
        </div>
      </div>

      <Sheet
        open={!!source}
        onClose={closeSheet}
        title="Restaurar backup"
        description={source ? `${source.fileName} · ${fmtBytes(source.fileSize)}` : undefined}
        footer={
          report ? (
            <Button onClick={() => setSource(null)}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeSheet} disabled={restoring}>Cancelar</Button>
              <Button variant={mode === "replace" ? "danger" : "primary"} onClick={doRestore} disabled={restoring || !summary.length || (mode === "replace" && !agree)}>
                {restoring && <Loader2 className="w-4 h-4 animate-spin" />} {mode === "replace" ? "Substituir tudo" : "Restaurar"}
              </Button>
            </>
          )
        }
      >
        {source && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm font-semibold">{source.src.label}</p>
              {source.src.created_at && <p className="text-xs text-muted">Feito em {new Date(source.src.created_at).toLocaleString("pt-BR")}</p>}
            </div>

            <div>
              <h4 className="font-sans text-xs font-semibold text-muted uppercase tracking-wide mb-2">O que tem no arquivo</h4>
              {summary.length ? (
                <ul className="flex flex-col divide-y divide-line border border-line rounded-xl">
                  {summary.map((s) => (
                    <li key={s.label} className="flex justify-between px-3 py-2 text-sm">
                      <span>{s.label}</span><span className="font-semibold tabular-nums">{s.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Este backup está vazio.</p>
              )}
              {source.src.filesBytes > 0 && <p className="text-xs text-muted mt-2">{fmtBytes(source.src.filesBytes)} de arquivos para enviar. Deixe esta aba aberta até terminar.</p>}
            </div>

            {source.src.notes.length > 0 && (
              <ul className="flex flex-col gap-2">
                {source.src.notes.map((n) => (
                  <li key={n} className="flex gap-2 text-xs bg-warn-soft text-warn rounded-[10px] p-3"><AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{n}</li>
                ))}
              </ul>
            )}

            {!report && (
              <fieldset className="flex flex-col gap-2" disabled={restoring}>
                <legend className="font-sans text-xs font-semibold text-muted uppercase tracking-wide mb-2">Como restaurar</legend>
                {([
                  ["merge", "Juntar com o que já tenho", "Recomendado. O que já existe com o mesmo nome não é duplicado, então dá para rodar de novo se parar no meio."],
                  ["replace", "Substituir tudo", "Deixa a conta igual ao backup: o que você tem hoje é apagado. Só apaga no final, depois que tudo do backup entrou; se algo falhar, nada é apagado."],
                ] as const).map(([id, label, hint]) => (
                  <label key={id} className={cn("flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors", mode === id ? "border-fg bg-surface" : "border-line hover:border-fg")}>
                    <input type="radio" name="restore-mode" value={id} checked={mode === id} onChange={() => { setMode(id); setAgree(false); }} className="mt-0.5 accent-[var(--fg)] cursor-pointer" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted mt-0.5">{hint}</span>
                    </span>
                  </label>
                ))}
                {mode === "replace" && (
                  <label className="flex gap-2.5 items-start text-sm mt-1 p-3 rounded-xl bg-hot-soft text-hot cursor-pointer">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 cursor-pointer" />
                    Entendo que minhas mensagens, mídias, funis, gatilhos, leads e tarefas de hoje serão apagados.
                  </label>
                )}
              </fieldset>
            )}

            {restoring && <ProgressBar p={rProgress} />}

            {report && (
              <div className="flex flex-col gap-3">
                <div className={cn("flex gap-2 text-sm rounded-[10px] p-3", report.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                  {report.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span className="font-semibold">
                    {report.ok
                      ? report.replaced ? "Pronto. A conta agora está igual ao backup." : "Pronto. Backup restaurado."
                      : report.mode === "replace" ? "Não foi possível substituir. Seus dados de antes continuam como estavam." : "Restaurado com problemas. Você pode rodar de novo: o que já entrou não é duplicado."}
                  </span>
                </div>
                {(total(report.added) > 0 || total(report.reused) > 0) && (
                  <ul className="flex flex-col divide-y divide-line border border-line rounded-xl">
                    {(Object.keys(REPORT_LABELS) as TableName[]).filter((t) => report.added[t] || report.reused[t]).map((t) => (
                      <li key={t} className="flex justify-between gap-3 px-3 py-2 text-sm">
                        <span>{REPORT_LABELS[t]}</span>
                        <span className="text-right tabular-nums">
                          <span className="font-semibold">{report.added[t] ?? 0} novo{(report.added[t] ?? 0) === 1 ? "" : "s"}</span>
                          {report.reused[t] ? <span className="text-muted"> · {report.reused[t]} já existia{report.reused[t] === 1 ? "" : "m"}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {report.problems.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-muted list-disc pl-4">
                    {report.problems.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
