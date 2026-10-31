"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { fonteDasRotas } from "@/lib/campanhas-fonte";
import NovaBusca from "./NovaBusca";
import type { LocalInicial } from "./tipos";

// A página de verdade da Nova busca (`/campanhas/buscas/nova`): a mesma tela do
// preview, escrevendo pela rota. Voltar e uma busca começada levam a Leads, que o
// servidor relê (a busca nova aparece "Buscando"); `replace`, para o "voltar" do
// navegador não reabrir o formulário de uma busca paga já feita. A campanha que
// esperava contatos (`?rascunho=`) volta junto.
export default function NovaBuscaAoVivo({ localInicial, rascunho }: { localInicial: LocalInicial | null; rascunho: string | null }) {
  const fonte = useMemo(() => fonteDasRotas(), []);
  const router = useRouter();
  const voltar = () => router.replace(`/campanhas${rascunho ? `?rascunho=${rascunho}` : ""}`);
  return (
    <NovaBusca
      voltar={voltar}
      localInicial={localInicial}
      aoBuscar={async (o) => {
        const r = await fonte.novaBusca(o);
        if (r.ok) voltar();
        return r;
      }}
    />
  );
}
