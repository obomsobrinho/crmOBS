import { NextResponse } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { numeroNoWhatsApp } from "@/lib/evolution";
import { ehNumeroDeAvisos, telefoneImpossivel } from "@/lib/avisos";
import {
  emailValido,
  grafiasDoTelefone,
  jidDePessoa,
  telefoneDoCadastro,
} from "@/lib/clientes";

// NOVO CLIENTE (fatia B da tela de Clientes, 01/10/2026, docs/plano-clientes.md).
//
// POR QUE SERVICE_ROLE: o browser não tem INSERT em `dados_cliente` e não vai
// ter (`mt_dados_cliente_revoke_sobras`). Todo contato nascia pelo n8n, na
// primeira mensagem; este é o segundo caminho, e o único pelo CRM.
//
// CADASTRAR NÃO ENVIA NADA. Escrever é o passo seguinte, na ficha, com o aviso
// de bloqueio para quem nunca escreveu.
//
// Três regras que não se negociam:
// 1. O TELEFONE GRAVADO É O DO WHATSAPP, não o digitado: o n8n acha o contato
//    pelo `remoteJid` exato, e número antigo chega sem o nono dígito. Gravar a
//    grafia digitada faria a resposta da pessoa nascer como OUTRO contato.
// 2. NÚMERO QUE JÁ EXISTE NÃO DUPLICA: a rota devolve o id de quem já está lá
//    (`existente: true`) e a tela abre a ficha dele.
// 3. A CONVERSA VAZIA NASCE JUNTO (D6): tags e notas moram na conversa, e sem a
//    linha de `conversations` os dois blocos não teriam onde gravar até a
//    primeira mensagem. Ela não aparece em Conversas nem no Pipeline enquanto
//    não houver mensagem (`buildInbox`).
export async function POST(req: Request) {
  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  // Conta bloqueada fica em modo leitura, e cadastrar é trabalho.
  if (client.access.blocked) {
    return NextResponse.json({ error: client.access.message }, { status: 402 });
  }

  let body: { telefone?: unknown; nome?: unknown; email?: unknown; nascimento?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tel = telefoneDoCadastro(typeof body.telefone === "string" ? body.telefone : "");
  if (!tel.ok) {
    return NextResponse.json({ error: tel.motivo, campo: "telefone" }, { status: 400 });
  }
  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  if (!emailValido(email)) {
    return NextResponse.json({ error: "E-mail inválido.", campo: "email" }, { status: 400 });
  }
  // A tela manda AAAA-MM-DD já validado (`telaParaIso`); aqui só a forma.
  const nascimento =
    typeof body.nascimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.nascimento)
      ? body.nascimento
      : null;

  if (ehNumeroDeAvisos(jidDePessoa(tel.digitos), client.avisos)) {
    return NextResponse.json(
      { error: "Esse é o número que recebe os avisos, não um cliente.", campo: "telefone" },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  // Já existe? Procura nas grafias possíveis (com e sem o 9, com e sem sufixo).
  const { data: achados, error: errBusca } = await svc
    .from("dados_cliente")
    .select("id, telefone")
    .eq("client_id", client.id)
    .in("telefone", grafiasDoTelefone(tel.digitos))
    .limit(1);
  if (errBusca) {
    return NextResponse.json({ error: "Não deu para cadastrar agora." }, { status: 500 });
  }
  if (achados && achados.length > 0) {
    const existente = achados[0] as { id: number; telefone: string };
    await garantirConversa(svc, client.id, existente.telefone);
    return NextResponse.json({ id: existente.id, existente: true });
  }

  // O endereço real no WhatsApp. O número impossível dos testes nunca vai à
  // Evolution; sem instância ou sem resposta, segue a grafia digitada.
  let jid = jidDePessoa(tel.digitos);
  if (!telefoneImpossivel(tel.digitos) && client.evolution_instance) {
    const consulta = await numeroNoWhatsApp(client.evolution_instance, tel.digitos);
    if (consulta && !consulta.existe) {
      return NextResponse.json(
        { error: "Esse número não tem WhatsApp.", campo: "telefone" },
        { status: 422 }
      );
    }
    if (consulta?.jid) jid = consulta.jid;
  }

  const { data: criado, error: errCria } = await svc
    .from("dados_cliente")
    .insert({
      client_id: client.id,
      telefone: jid,
      display_name: nome || null,
      email: email || null,
      birth_date: nascimento,
      // A IA atende quando a pessoa responder (D7).
      atendimento_ia: "ativa",
    })
    .select("id")
    .single();

  if (errCria) {
    // Duas abas cadastrando o mesmo número ao mesmo tempo: quem perdeu a
    // corrida abre a ficha de quem ganhou.
    if (errCria.code === "23505") {
      const { data: outro } = await svc
        .from("dados_cliente")
        .select("id")
        .eq("client_id", client.id)
        .eq("telefone", jid)
        .maybeSingle();
      if (outro) return NextResponse.json({ id: (outro as { id: number }).id, existente: true });
    }
    console.error("novo cliente:", errCria.message);
    return NextResponse.json({ error: "Não deu para cadastrar agora." }, { status: 500 });
  }

  await garantirConversa(svc, client.id, jid);
  return NextResponse.json({ id: (criado as { id: number }).id, existente: false });
}

/**
 * A linha de `conversations` do contato (D6). Best-effort: o contato já está
 * cadastrado, e a conversa nasce sozinha na primeira mensagem (gatilho
 * `sync_conversation`) se esta escrita falhar.
 */
async function garantirConversa(
  svc: ReturnType<typeof createServiceClient>,
  clientId: string,
  phone: string
): Promise<void> {
  const { error } = await svc
    .from("conversations")
    .upsert({ client_id: clientId, phone }, { onConflict: "client_id,phone", ignoreDuplicates: true });
  if (error) console.error("novo cliente, conversa vazia:", error.message);
}
