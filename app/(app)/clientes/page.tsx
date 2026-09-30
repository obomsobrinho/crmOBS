import { UsersRound } from "lucide-react";

// Nenhum cliente aberto. No celular esta coluna some (a lista é a tela).
export default function ClientesPage() {
  return (
    <div
      data-clientes-vazio
      className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <UsersRound size={28} className="text-ink-faint" />
      <p className="max-w-[260px] text-apoio text-ink-2" style={{ textWrap: "pretty" }}>
        Escolha um cliente na lista para ver e completar o cadastro.
      </p>
    </div>
  );
}
