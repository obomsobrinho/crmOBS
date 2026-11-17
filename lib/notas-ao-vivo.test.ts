import { describe, expect, it } from "vitest";
import { aplicarEventoDeNota } from "./notas-ao-vivo";

const nota = (id: number, createdAt: string) => ({ id, body: `n${id}`, authorUserId: null, createdAt });
const lista = [nota(2, "2026-11-14T12:00:00Z"), nota(1, "2026-11-14T11:00:00Z")];

describe("aplicarEventoDeNota", () => {
  it("DELETE com só o id (como o Supabase manda) tira a nota da tela", () => {
    const r = aplicarEventoDeNota(lista, { tipo: "DELETE", novo: null, antigo: { id: 2 } }, 7);
    expect(r.map((n) => n.id)).toEqual([1]);
  });
  it("DELETE de um id que não está na tela é ignorado (mesma lista)", () => {
    expect(aplicarEventoDeNota(lista, { tipo: "DELETE", novo: null, antigo: { id: 99 } }, 7)).toBe(lista);
    expect(aplicarEventoDeNota(lista, { tipo: "DELETE", novo: null, antigo: null }, 7)).toBe(lista);
  });
  it("INSERT desta conversa entra na ordem; de outra conversa não entra", () => {
    const novo = { id: 3, conversation_id: 7, body: "oi", author_user_id: "u", created_at: "2026-11-14T13:00:00Z" };
    expect(aplicarEventoDeNota(lista, { tipo: "INSERT", novo, antigo: null }, 7).map((n) => n.id)).toEqual([3, 2, 1]);
    expect(aplicarEventoDeNota(lista, { tipo: "INSERT", novo: { ...novo, conversation_id: 8 }, antigo: null }, 7)).toBe(lista);
  });
  it("UPDATE troca a nota pelo id, sem duplicar", () => {
    const novo = { id: 1, conversation_id: 7, body: "editada", author_user_id: null, created_at: "2026-11-14T11:00:00Z" };
    const r = aplicarEventoDeNota(lista, { tipo: "UPDATE", novo, antigo: { id: 1 } }, 7);
    expect(r).toHaveLength(2);
    expect(r[1].body).toBe("editada");
  });
});
