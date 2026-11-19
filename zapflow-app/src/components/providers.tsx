"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export async function logout() {
  const { error } = await createClient().auth.signOut();
  if (error) { toast.error("Não foi possível sair. Tente de novo."); return; }
  window.location.replace("/auth/login");
}

export function QueryScope({ accountId, children }: { accountId?: string; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!accountId) return;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === accountId) return;
      setLeaving(true);
      queryClient.clear();
      toast.dismiss();
      window.location.replace(session ? "/dashboard" : "/auth/login");
    });
    return () => subscription.unsubscribe();
  }, [accountId, queryClient]);
  return <QueryClientProvider client={queryClient}>{leaving ? null : children}</QueryClientProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryScope>
      {children}
      <Toaster
        theme="system"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--line)",
            color: "var(--fg)",
            boxShadow: "var(--elev)",
            borderRadius: "12px",
          },
        }}
        closeButton
      />
    </QueryScope>
  );
}
