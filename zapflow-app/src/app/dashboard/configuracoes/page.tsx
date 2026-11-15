"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Panel } from "@/components/ui/shared";
import { applyThemePref, getServerThemePref, getThemePref, subscribeThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { BackupTools } from "@/components/features/backup-tools";
import { toast } from "sonner";

const supabase = createClient();

const THEMES: { id: ThemePref; label: string; hint: string; icon: typeof Sun }[] = [
  { id: "system", label: "Sistema", hint: "Segue o computador", icon: Monitor },
  { id: "light", label: "Claro", hint: "Fundo branco", icon: Sun },
  { id: "dark", label: "Escuro", hint: "Fundo preto", icon: Moon },
];

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-6 flex flex-col gap-5" aria-label={title}>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
      {children}
    </Panel>
  );
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const pref = useSyncExternalStore(subscribeThemePref, getThemePref, getServerThemePref);
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user, staleTime: 5 * 60 * 1000 });

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Use pelo menos 6 caracteres na nova senha.");
    if (pw !== pw2) return toast.error("As duas senhas não são iguais.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) {
      return toast.error(/different from the old/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha. Tente de novo.");
    }
    setPw("");
    setPw2("");
    toast.success("Senha atualizada");
  };

  const logout = async () => {
    try { await supabase.auth.signOut(); } finally { router.push("/auth/login"); }
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-[720px] w-full mx-auto">
      <Section title="Conta" description="O mesmo e-mail e senha entram no painel e na extensão.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-surface border border-line grid place-items-center text-sm font-semibold shrink-0" aria-hidden="true">
            {(me.data?.email ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">E-mail</p>
            {me.isLoading ? <span className="skeleton h-5 w-48 block" /> : <p className="text-sm font-semibold truncate">{me.data?.email ?? "Não identificado"}</p>}
          </div>
          <Button variant="secondary" onClick={logout}><LogOut className="w-4 h-4" /> Sair</Button>
        </div>

        <form onSubmit={changePassword} className="flex flex-col gap-4 pt-5 border-t border-line" aria-label="Trocar senha">
          <h3 className="font-sans text-sm font-semibold tracking-normal">Trocar senha</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw" className="text-xs font-medium text-muted">Nova senha</label>
              <input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw2" className="text-xs font-medium text-muted">Repita a nova senha</label>
              <input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div><Button type="submit" disabled={saving || !pw}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar nova senha</Button></div>
        </form>
      </Section>

      <Section title="Aparência" description="Vale para este navegador.">
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-3">
          {THEMES.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={pref === id}
              onClick={() => applyThemePref(id)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-4 rounded-xl border text-center cursor-pointer transition-colors",
                pref === id ? "border-fg bg-surface" : "border-line hover:border-fg"
              )}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Backup e restauração" description="Guarde uma cópia de tudo num arquivo e traga de volta quando precisar. Também traz o backup do ZapVoice.">
        <BackupTools />
      </Section>

      <Section title="Extensão do WhatsApp" description="Envie mensagens, áudios e arquivos da sua biblioteca direto nas conversas.">
        <ol className="flex flex-col gap-3 text-sm">
          {[
            "No Chrome, abra chrome://extensions e ative o Modo do desenvolvedor.",
            "Clique em Carregar sem compactação e escolha a pasta extension do projeto.",
            "Abra o WhatsApp Web, clique no raio do ZapFlow e entre com a mesma conta.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-on-primary grid place-items-center text-xs font-semibold shrink-0 tabular-nums">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
