"use client";

import { create } from "zustand";
import type { NavPage } from "@/types";

interface AppState {
  // Navigation
  currentPage: NavPage;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;

  // Actions
  setPage: (page: NavPage) => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: "inicio",
  sidebarOpen: true,
  mobileSidebarOpen: false,

  setPage: (page) =>
    set({ currentPage: page, mobileSidebarOpen: false }),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleMobileSidebar: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),

  closeMobileSidebar: () =>
    set({ mobileSidebarOpen: false }),
}));
