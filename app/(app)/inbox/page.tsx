import { MessagesSquare } from "lucide-react";

export default function InboxIndex() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-dim">
      <MessagesSquare size={40} strokeWidth={1.5} className="opacity-50" />
      <span className="text-sm">Selecione uma conversa</span>
    </div>
  );
}
