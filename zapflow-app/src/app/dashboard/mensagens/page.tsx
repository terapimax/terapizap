"use client";

import { useState } from "react";
import { AlertCircle, Copy, Loader2, MessageSquareText, Plus, Star, Trash2 } from "lucide-react";
import { useMessages, useCreateMessage, useUpdateMessage, useDeleteMessage } from "@/hooks/use-messages";
import { useOpenFromQuery } from "@/hooks/use-open-from-query";
import { Modal } from "@/components/ui/modal";
import { Button, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Message } from "@/types";

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

export default function MensagensPage() {
  const { data: messages = [], isLoading, isError } = useMessages();
  const createMsg = useCreateMessage();
  const updateMsg = useUpdateMessage();
  const deleteMsg = useDeleteMessage();

  const [search, setSearch] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [editing, setEditing] = useState<Message | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  useOpenFromQuery(() => setEditing("new"));

  const q = search.trim().toLowerCase();
  const shown = messages.filter(
    (m) => (!onlyFav || m.is_favorite) && (!q || m.title.toLowerCase().includes(q) || (m.content || "").toLowerCase().includes(q))
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar suas mensagens" description="O banco de dados não respondeu. Recarregue a página." />;
  }

  const addButton = <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Nova mensagem</Button>;

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-[1100px] w-full mx-auto">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar mensagens" />
        <button
          type="button"
          aria-pressed={onlyFav}
          onClick={() => setOnlyFav((v) => !v)}
          className={cn("h-10 px-3.5 rounded-[10px] border text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors", onlyFav ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}
        >
          <Star className={cn("w-4 h-4", onlyFav && "fill-current")} /> Favoritos
        </button>
        <span className="text-sm text-muted tabular-nums">{messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}</span>
        <div className="ml-auto">{addButton}</div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-[76px]" />)}</div>
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={MessageSquareText}
            title={messages.length === 0 ? "Nenhuma mensagem ainda" : "Nada encontrado"}
            description={messages.length === 0 ? "Crie textos prontos para enviar com um clique. A extensão mostra “digitando…” antes de cada envio." : onlyFav ? "Você ainda não favoritou nenhuma mensagem." : `Nenhum resultado para “${search}”.`}
            action={messages.length === 0 ? addButton : undefined}
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden" aria-label="Lista de mensagens">
          {shown.map((m) => (
            <div key={m.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
              <span className="w-10 h-10 rounded-[10px] bg-surface group-hover:bg-card grid place-items-center shrink-0 text-muted"><MessageSquareText className="w-5 h-5" /></span>
              <button type="button" onClick={() => setEditing(m)} className="flex-1 min-w-0 text-left cursor-pointer">
                <p className="text-sm font-semibold truncate">{m.title}</p>
                <p className="text-sm text-muted line-clamp-1 whitespace-pre-line">{m.content || "Sem texto"}</p>
              </button>
              <button
                type="button"
                aria-label={m.is_favorite ? "Remover dos favoritos" : "Favoritar"}
                aria-pressed={m.is_favorite}
                onClick={() => updateMsg.mutate({ id: m.id, is_favorite: !m.is_favorite })}
                className={cn("h-8 w-8 grid place-items-center rounded-lg cursor-pointer", m.is_favorite ? "text-warn" : "text-muted hover:text-fg hover:bg-card")}
              >
                <Star className={cn("w-4 h-4", m.is_favorite && "fill-current")} />
              </button>
              <button type="button" aria-label={`Copiar ${m.title}`} onClick={() => copy(m.content || "")} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-card cursor-pointer">
                <Copy className="w-4 h-4" />
              </button>
              <button type="button" aria-label={`Excluir ${m.title}`} onClick={() => setToDelete(m)} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </Panel>
      )}

      {editing && (
        <MessageForm
          key={editing === "new" ? "new" : editing.id}
          message={editing === "new" ? null : editing}
          saving={createMsg.isPending || updateMsg.isPending}
          onClose={() => setEditing(null)}
          onSave={async (title, content) => {
            if (editing === "new") await createMsg.mutateAsync({ title, content });
            else await updateMsg.mutateAsync({ id: editing.id, title, content });
            setEditing(null);
          }}
        />
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Excluir “${toDelete?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (toDelete) deleteMsg.mutate(toDelete.id); setToDelete(null); }}>Excluir</Button>
        </>}
      >
        <p className="text-sm text-muted">A mensagem some da biblioteca e dos funis que a usam. Isso não pode ser desfeito.</p>
      </Modal>
    </div>
  );
}

function MessageForm({ message, saving, onClose, onSave }: {
  message: Message | null; saving: boolean; onClose: () => void; onSave: (title: string, content: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(message?.title ?? "");
  const [content, setContent] = useState(message?.content ?? "");

  const submit = () => {
    if (!title.trim()) return toast.error("Dê um título para encontrar a mensagem depois.");
    if (!content.trim()) return toast.error("Escreva o texto da mensagem.");
    onSave(title.trim(), content);
  };

  return (
    <Modal open onClose={onClose} title={message ? "Editar mensagem" : "Nova mensagem"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="msg-title" className="text-xs font-medium text-muted">Título</label>
          <input id="msg-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Boas-vindas" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="msg-content" className="text-xs font-medium text-muted">Texto</label>
          <textarea
            id="msg-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Escreva a mensagem como você falaria com o cliente"
            className="w-full px-3 py-2.5 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors resize-y"
          />
          <p className="text-xs text-muted tabular-nums">{content.length} caracteres · a extensão mostra “digitando…” por cerca de {Math.min(9, Math.max(1.5, content.length * 0.055)).toFixed(0)} s antes de enviar</p>
        </div>
      </div>
    </Modal>
  );
}
