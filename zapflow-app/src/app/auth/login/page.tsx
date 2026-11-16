"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { BrandLogo, useBrand } from "@/components/brand";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mic, Filter, MessageSquareText } from "lucide-react";

const errorMessages: Record<string, string> = {
  "Invalid login credentials": "Email ou senha incorretos",
  "Email not confirmed": "Email ainda não confirmado. Verifique sua caixa de entrada.",
  "User already registered": "Este email já está cadastrado. Tente fazer login.",
  "Signup requires a valid password": "A senha deve ter pelo menos 6 caracteres",
  "email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "Email address is invalid": "Endereço de email inválido",
  "Password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres",
};

function translateError(msg: string): string {
  // Check exact matches
  for (const [key, value] of Object.entries(errorMessages)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return msg;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const router = useRouter();
  const brand = useBrand();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          // O link do e-mail de confirmação volta para cá e cria a sessão
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });

        if (signUpError) {
          setError(translateError(signUpError.message));
          setLoading(false);
          return;
        }

        // Check if email confirmation is needed
        if (data.user && !data.session) {
          setSuccess("Conta criada! Verifique seu email para confirmar o cadastro.");
          setLoading(false);
          return;
        }

        // Auto-confirmed (no email verification required)
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(translateError(signInError.message));
          setLoading(false);
          return;
        }

        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  };

  const perks = [
    { icon: MessageSquareText, title: "Um clique para enviar", text: "Mensagens, áudios, imagens e documentos da sua biblioteca, direto na conversa." },
    { icon: Mic, title: "Parece que você está digitando", text: "O contato vê “digitando…” ou “gravando áudio…” antes de cada envio." },
    { icon: Filter, title: "Funis e leads juntos", text: "Acompanhe cada lead por etapa e monte sequências de mensagens." },
  ];

  const inputCls =
    "w-full h-11 px-3.5 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-bg text-fg">
      {/* Marca */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-[#0b0b0d] text-[#f4f4f6]">
        <div className="flex items-center gap-2.5">
          {/* com logotipo próprio, ele fica sobre uma placa clara: o fundo desta coluna é sempre preto */}
          {brand.logoUrl ? (
            <span className="inline-flex items-center rounded-xl bg-white px-3.5 py-2.5"><BrandLogo size={36} /></span>
          ) : (
            <BrandLogo size={36} textClassName="text-xl" />
          )}
        </div>
        <div className="flex flex-col gap-8 max-w-md">
          <h2 className="font-display text-4xl font-bold tracking-tight leading-tight">Atenda no WhatsApp sem perder tempo.</h2>
          <ul className="flex flex-col gap-6">
            {perks.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="w-10 h-10 rounded-[10px] bg-white/10 grid place-items-center shrink-0"><Icon className="w-5 h-5" aria-hidden="true" /></span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-[#a3a3ad] mt-0.5">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-[#a3a3ad]">{brand.name} · Automação para WhatsApp Web</p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <BrandLogo size={36} textClassName="text-xl" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">{isRegister ? "Criar sua conta" : "Entrar"}</h1>
          <p className="text-muted mt-1.5 mb-8">{isRegister ? "Leva menos de um minuto." : `Use o e-mail da sua conta ${brand.name}.`}</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">E-mail</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required className={inputCls} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  required
                  minLength={6}
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-fg cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 p-3 rounded-[10px] bg-hot-soft text-hot text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> <span>{error}</span>
              </div>
            )}
            {success && (
              <div role="status" className="flex items-start gap-2.5 p-3 rounded-[10px] bg-ok-soft text-ok text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-[10px] bg-primary text-on-primary font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isRegister ? "Criar conta" : "Entrar"}
            </button>
          </form>

          <p className="text-sm text-muted mt-6">
            {isRegister ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(""); setSuccess(""); }}
              className="font-semibold text-fg underline underline-offset-2 cursor-pointer"
            >
              {isRegister ? "Entrar" : "Criar conta"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
