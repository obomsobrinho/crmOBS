import { MessagesSquare } from "lucide-react";

export default function InboxIndex() {
  return (
    <div
      data-inbox-vazio
      className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-3"
    >
      <MessagesSquare size={40} strokeWidth={1.5} className="opacity-50" />
      <span className="text-apoio">Selecione uma conversa</span>
    </div>
  );
}
