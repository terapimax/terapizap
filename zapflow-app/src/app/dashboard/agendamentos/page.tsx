import { redirect } from "next/navigation";

// A Agenda virou a visão "Calendário" dentro de Tarefas.
export default function AgendaRedirect() {
  redirect("/dashboard/tarefas?v=calendario");
}
