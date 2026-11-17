"use client";

import { useEffect } from "react";
import { useSessao } from "@/lib/sessao";
import { pedirConferenciaDasFotos } from "../api/navegador";
import ContactSidebar from "./ContactSidebar";

/**
 * A lista de Conversas na página de verdade: a sessão vem do layout do `(app)` (D8, sem
 * banco no clique) e a lista lê pelo cache. A conferência das fotos de perfil vencidas,
 * que o layout fazia com `after()`, a tela pede depois de abrir (no máximo a cada 10 min).
 */
export default function ListaDaSessao() {
  const s = useSessao();
  useEffect(() => {
    if (s.temWhatsapp) pedirConferenciaDasFotos();
  }, [s.temWhatsapp]);
  return <ContactSidebar clientId={s.clientId} myUserId={s.userId} numeroAvisos={s.avisos} />;
}
