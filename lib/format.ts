// ⚠️ TODA data na tela sai em America/Sao_Paulo, nunca no fuso da máquina.
// O componente é renderizado primeiro no servidor (Vercel, em UTC), e o
// `suppressHydrationWarning` MANTÉM o texto do servidor: sem o fuso fixo, a
// mensagem das 17:47 aparecia como 20:47 no celular (achado do dono, 27/09/2026).
export const FUSO = "America/Sao_Paulo";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

// Quanto tempo a conversa está esperando por um humano, em texto curto: "agora",
// "12 min", "6h", "2 d". Grosso de propósito (não existe "6h 36min"): quem olha
// a lista decide por ordem de grandeza, e o minuto exato só ocuparia a linha.
// `agora` é parâmetro para o teste ser determinístico.
export function formatEspera(iso: string, agora: number = Date.now()): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)} d`;
}

// Só os dígitos do JID (para links wa.me e afins). Ex.: "553584774753".
export function phoneDigits(jid: string): string {
  return jid.split("@")[0].replace(/\D/g, "");
}

// Telefone formatado para exibição. BR: +55 (35) 98477-4753.
// Fallback (outros países / formato inesperado): "+<dígitos>".
export function prettyPhone(jid: string): string {
  const d = phoneDigits(jid);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 (${ddd}) ${mid}-${end}`;
  }
  return d ? `+${d}` : jid;
}

/**
 * Máscara de telefone do Brasil enquanto a pessoa digita: `(11) 91234-5678`
 * ou `(11) 1234-5678`. O 55 é automático no produto, então quem cola
 * `+55 11 ...` tem o 55 tirado aqui (achado do dono, 30/09/2026: "colocar um
 * número precisa de máscara").
 */
export function mascaraTelefoneBR(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
