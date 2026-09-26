import { test, expect } from "@playwright/test";

// Guardas de `/montagem`, COM LOGIN e contra o banco de verdade (o tenant de
// teste, a OBS desde 17/09/2026, que JÁ publicou o agente).
//
// O assistente tem QUATRO guardas, e elas são a diferença entre "roda uma vez na
// vida da conta" e "existe um segundo lugar de editar o agente que está atendendo
// cliente de verdade". Até 07/09/2026 nenhuma tinha teste: o que existia era
// `montagem.design.spec.ts`, que renderiza o wizard em `/design/montagem` com
// dado falso e NUNCA passa por guarda nenhuma, porque a rota de preview não tem.
//
// ⚠️ Só a guarda 3 é testável com a sessão que existe hoje. As outras três estão
// no fim do arquivo, com o motivo e o fixture que falta em cada uma. Escrever
// qualquer uma delas com a sessão do dono do tenant de teste provaria o contrário do
// que ela afirma.

test.describe("Guardas do assistente de montagem", () => {
  test("quem já publicou é mandado para /agente", async ({ page }) => {
    // Guarda 3. O assistente roda UMA vez na vida da conta e some para sempre
    // depois da primeira ativação. Sem ela, o dono de uma conta em produção
    // poderia reabrir o assistente e salvar por cima da configuração do agente
    // que está atendendo, pelo formulário guiado.
    await page.goto("/montagem");
    await page.waitForURL("**/agente", { timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe("/agente");
  });

  test("o assistente não tem porta de entrada depois de publicar", async ({
    page,
  }) => {
    // A contrapartida da guarda 3 na interface: além de redirecionar, a conta que
    // já publicou não pode ter link para o assistente. A linha `AvisoMontagem`
    // existe em toda página do app ENQUANTO o agente não foi ao ar, e some
    // depois. Um link que leva a um redirecionamento é promessa falsa.
    await page.goto("/painel");
    await page.waitForSelector("h1", { timeout: 20_000 });
    await expect(page.locator('a[href="/montagem"]')).toHaveCount(0);
  });
});

// ⚠️ AS TRÊS GUARDAS SEM TESTE, e o que falta em cada uma:
//
// 1. CONTA BLOQUEADA vai para `/assinatura` (`requireActiveTenant`).
//    Falta: sessão de uma conta com assinatura vencida. O tenant de teste nunca
//    fica bloqueado, de propósito, porque é onde todo o resto da suíte roda (e
//    no beta a chave `BETA_ABERTO` libera todo tenant de qualquer forma). Criar uma conta vencida só para isto significa mais um tenant
//    de mentira no banco de produção; a alternativa honesta é testar
//    `accessState` como função pura, que é onde a decisão mora de verdade
//    (`lib/billing.ts`), e deixar o redirecionamento para verificação manual.
//
// 2. ✅ ATENDENTE vai para `/inbox`: COBERTO desde 17/09/2026, em
//    `atendente.att.spec.ts`. O `auth.setup.ts` passou a gravar duas sessões.
//
// 3. MODO AVANÇADO vai para `/agente`.
//    Falta: uma conta em `prompt_mode='avancado'` que ainda NÃO publicou, que é
//    exatamente o caso que esta guarda protege e que nenhum tenant real ocupa
//    hoje (a OBM é avançada mas já publicou, e escrever na OBM é proibido pelo
//    projeto). O tenant de teste (OBS) é avançado mas também já publicou, então
//    a guarda 3 chega antes e esta nunca é exercida por ele.

// ⚠️ SEM TESTE, desde 24/09/2026: o 409 da PRIMEIRA ATIVAÇÃO com o WhatsApp não
// conectado de verdade (`PUT /api/clients/[id]/publish` consulta o estado real
// na Evolution e recusa se não for `open`).
//    Falta: uma conta que ainda NÃO publicou, com instância criada e nunca lida.
//    A OBS já publicou, então a regra nem é consultada para ela (vale só na
//    primeira ativação), e o teste passaria sem exercer nada. Criar um tenant
//    novo por teste deixaria uma instância órfã na Evolution a cada execução.
//    O que existe: o botão "Ativar o agente" desabilitado até conectar, provado
//    sem login em `montagem.design.spec.ts`. A regra do servidor fica para o
//    teste com chip real pelo dono.
