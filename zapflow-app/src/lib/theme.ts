export type ThemePref = "system" | "light" | "dark";

const KEY = "zf-theme";
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

export function getServerThemePref(): ThemePref {
  return "system";
}

export function subscribeThemePref(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function isDarkNow() {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Aplica e guarda a preferência. "system" volta a seguir o tema do computador. */
export function applyThemePref(pref: ThemePref) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
  if (pref === "system") root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
  else root.classList.add(pref);
  listeners.forEach((l) => l());
}
