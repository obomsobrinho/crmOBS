"use client";

import { useSessao } from "@/lib/sessao";
import PipelineBoard from "./PipelineBoard";

/** O Pipeline na página de verdade: a sessão vem do layout (D8, sem banco no clique). */
export default function TelaDoPipeline() {
  const s = useSessao();
  return <PipelineBoard clientId={s.clientId} myRole={s.papel} numeroAvisos={s.avisos} initialStages={[]} />;
}
