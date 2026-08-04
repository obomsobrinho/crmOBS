import { redirect } from "next/navigation";
import { getMyClient } from "@/lib/auth";
import ConnectWhatsApp from "@/components/ConnectWhatsApp";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const client = await getMyClient();
  if (!client) redirect("/login");

  return (
    <ConnectWhatsApp
      clientId={client.id}
      clientName={client.name}
      hasInstance={!!client.evolution_instance}
    />
  );
}
