export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
