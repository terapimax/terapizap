"use client";

import { useEffect, useRef } from "react";

/**
 * Abre algo (ex.: o formulário de criação) quando a página chega com `?novo=1`,
 * como nos atalhos "Nova mensagem" da extensão. Tira o parâmetro do endereço em seguida
 * para que recarregar a página não abra de novo.
 */
export function useOpenFromQuery(onOpen: () => void, param = "novo") {
  const cb = useRef(onOpen);
  useEffect(() => { cb.current = onOpen; });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const id = requestAnimationFrame(() => cb.current());
    return () => cancelAnimationFrame(id);
  }, [param]);
}
