// QUEM É ADMIN (decisão do dono, 29/09/2026, docs/proximos-passos.md, seção Admin).
//
// Módulo PURO: o `proxy.ts`, a página `/admin`, as rotas `/api/admin/*` e o
// aviso de uso de IA ao dono usam a MESMA regra. Admin é quem tem o id de
// usuário (`auth.users.id`) na variável de servidor `ADMIN_USER_IDS` (lista
// separada por vírgula), NUNCA uma coluna do banco que um cliente pudesse mudar,
// e nunca um id escrito no código. Sem a variável, ninguém é admin e `/admin` é
// 404 para todo mundo.

/** Os ids da variável, sem espaços e sem vazios. */
export function idsDeAdmin(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** O usuário está na lista? Sem usuário ou sem lista, não. */
export function ehAdmin(
  userId: string | null | undefined,
  valor: string | null | undefined
): boolean {
  if (!userId) return false;
  return idsDeAdmin(valor).includes(userId);
}

/** A variável do servidor (lista separada por vírgula). Nunca `NEXT_PUBLIC`. */
export function listaDeAdmins(): string {
  return process.env.ADMIN_USER_IDS ?? "";
}

/** `ehAdmin` contra a lista do ambiente (proxy, página e rotas usam esta). */
export function ehAdminPeloAmbiente(userId: string | null | undefined): boolean {
  return ehAdmin(userId, listaDeAdmins());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de empresa (uuid) bem formado; parâmetro torto é 400, nunca 500. */
export function ehUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Caminhos que só o admin enxerga (página e rotas). */
export function caminhoDoAdmin(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}
