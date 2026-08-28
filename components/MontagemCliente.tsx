"use client";

import dynamic from "next/dynamic";

// Carregador do assistente de montagem, SEM pré-render.
//
// ⚠️ Existe por um motivo só, e ele não é desempenho: o assistente lê o rascunho
// da montagem no `localStorage` durante a primeira renderização. No servidor esse
// rascunho não existe, então a marcação pré-renderizada viria com os campos
// vazios e a do navegador viria preenchida, o que é divergência de hidratação.
// As alternativas seriam ler o rascunho num efeito (que dispara
// `set-state-in-effect` e ainda pisca a tela vazia) ou exigir um clique de
// "retomar" que ninguém pediu.
//
// `ssr: false` só vale dentro de um Client Component (ver
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md), por isso este
// arquivo é um, e por isso a página de `/montagem`, que é Server Component,
// importa daqui e não do assistente direto.
const MontagemWizard = dynamic(() => import("./MontagemWizard"), {
  ssr: false,
  // Casca do mesmo tamanho e da mesma cor, para a tela não piscar branco antes
  // de o assistente aparecer.
  loading: () => <div className="min-h-screen bg-canvas" />,
});

export default MontagemWizard;
