import { CatalogoView } from "./catalogo-view";

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  return <CatalogoView initialTab={aba === "campanhas" ? "campanhas" : "itens"} />;
}
