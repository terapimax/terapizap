"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { useDeleteOwner, useOwners, useSaveOwner } from "@/hooks/use-owners";
import { useLeads } from "@/hooks/use-leads";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/shared";
import { initials, TAG_COLORS } from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { Owner } from "@/types";

/** Bolinha com as iniciais do responsável (o nome completo fica no title). */
export function OwnerDot({ owner, className }: { owner: Pick<Owner, "name" | "color">; className?: string }) {
  return (
    <span title={`Responsável: ${owner.name}`} aria-label={`Responsável: ${owner.name}`}
      className={cn("w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0", className)} style={{ backgroundColor: owner.color }}>
      {initials(owner.name)}
    </span>
  );
}

export function OwnerLabel({ owner }: { owner: Pick<Owner, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: owner.color }} aria-hidden="true" />
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

/** Cadastro da equipe: nome, cor e quem participa do rodízio de leads novos. */
export function OwnerManager() {
  const { data: owners = [], isLoading } = useOwners();
  const { data: leads = [] } = useLeads();
  const save = useSaveOwner();
  const del = useDeleteOwner();
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<Owner | null>(null);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of leads) if (l.owner_id) m.set(l.owner_id, (m.get(l.owner_id) ?? 0) + 1);
    return m;
  }, [leads]);
  const rotating = owners.filter((o) => o.in_rotation).length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const used = new Set(owners.map((o) => o.color));
    const color = TAG_COLORS.slice(1).find((c) => !used.has(c)) ?? TAG_COLORS[(owners.length % (TAG_COLORS.length - 1)) + 1];
    await save.mutateAsync({ name, color, in_rotation: true });
    setName("");
  };

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <span className="skeleton h-12" />
      ) : owners.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <Users className="w-5 h-5 shrink-0" aria-hidden="true" />
          Ninguém cadastrado. Atende sozinho? Não precisa cadastrar ninguém.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line border border-line rounded-xl" aria-label="Responsáveis">
          {owners.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <OwnerDot owner={o} className="w-8 h-8 text-xs" />
              <div className="flex-1 min-w-[120px]">
                <p className="text-sm font-semibold truncate">{o.name}</p>
                <p className="text-xs text-muted tabular-nums">{counts.get(o.id) ?? 0} {(counts.get(o.id) ?? 0) === 1 ? "lead" : "leads"}</p>
              </div>
              <div className="flex gap-1" role="group" aria-label={`Cor de ${o.name}`}>
                {TAG_COLORS.slice(1, 8).map((c) => (
                  <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={o.color === c} onClick={() => o.color !== c && save.mutate({ id: o.id, color: c })}
                    className={cn("w-5 h-5 rounded-full cursor-pointer border-2", o.color === c ? "border-fg" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" title="Quem está no rodízio recebe os leads novos, um de cada vez">
                <input type="checkbox" checked={o.in_rotation} onChange={() => save.mutate({ id: o.id, in_rotation: !o.in_rotation })}
                  aria-label={`${o.name} recebe leads novos no rodízio`} className="w-4 h-4 accent-[var(--fg)] cursor-pointer" />
                No rodízio
              </label>
              <button type="button" aria-label={`Remover ${o.name}`} onClick={() => setToDelete(o)} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2" aria-label="Novo responsável">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome de quem atende (ex.: Marta)" aria-label="Nome do responsável" maxLength={60}
          className="flex-1 min-w-[200px] h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors" />
        <Button type="submit" variant="secondary" disabled={save.isPending || !name.trim()}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
        </Button>
      </form>

      {owners.length > 0 && (
        <p className="text-xs text-muted">
          {rotating === 0
            ? "Ninguém no rodízio: os leads novos chegam sem responsável e você escolhe na ficha de cada um."
            : rotating === 1
              ? `Todo lead novo vai para ${owners.find((o) => o.in_rotation)?.name}.`
              : `Os leads novos (WhatsApp, cadastro e importação) são divididos por igual entre as ${rotating} pessoas do rodízio, um de cada vez.`}
          {" "}Todos usam a mesma conta; o responsável serve para organizar e medir quem atende o quê.
        </p>
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Remover ${toDelete?.name ?? ""}?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}>Remover</Button>
        </>}
      >
        <p className="text-sm text-muted">
          {toDelete && (counts.get(toDelete.id) ?? 0) > 0
            ? `Os ${counts.get(toDelete.id)} leads dessa pessoa continuam salvos, mas ficam sem responsável.`
            : "Nenhum lead está com essa pessoa."}
        </p>
      </Modal>
    </div>
  );
}
