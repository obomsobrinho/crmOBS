import MolduraDaConversa from "@/features/conversas/components/MolduraDaConversa";

// Fallback ao trocar de conversa (Suspense do segmento [id]): a mesma moldura que a
// tela mostra enquanto a leitura do navegador não volta.
export default function Loading() {
  return <MolduraDaConversa />;
}
