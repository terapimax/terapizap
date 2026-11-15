// Mostrado na hora ao trocar de módulo, enquanto a nova tela é preparada (no modo dev a primeira
// visita compila a página). Sem isto o clique parece não ter feito nada e a pessoa clica de novo.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 max-w-[1240px] w-full mx-auto" aria-busy="true" aria-label="Carregando">
      <span className="skeleton h-10 w-64" />
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
        {[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-28" />)}
      </div>
      <span className="skeleton h-64" />
    </div>
  );
}
