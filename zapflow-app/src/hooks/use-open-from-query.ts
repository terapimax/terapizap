"use client";

import { useEffect, useRef } from "react";

/**
 * Abre algo quando a página chega com um parâmetro no endereço, como nos atalhos da extensão:
 * `?novo=1` (formulário de criação) ou `?lead=12` (ficha do lead). `onOpen` recebe o valor.
 * Tira o parâmetro do endereço em seguida para que recarregar a página não abra de novo.
 *
 * O valor fica guardado até ser usado: em desenvolvimento o React roda o efeito duas vezes, e a
 * primeira (que já tirou o parâmetro do endereço) é cancelada antes de abrir.
 */
export function useOpenFromQuery(onOpen: (value: string) => void, param = "novo") {
  const cb = useRef(onOpen);
  const pending = useRef<string | null>(null);
  useEffect(() => { cb.current = onOpen; });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(param)) {
      pending.current = url.searchParams.get(param) ?? "";
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (pending.current == null) return;
    const id = requestAnimationFrame(() => {
      const value = pending.current;
      pending.current = null;
      if (value != null) cb.current(value);
    });
    return () => cancelAnimationFrame(id);
  }, [param]);
}
