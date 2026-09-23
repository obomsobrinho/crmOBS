# Relatório da execução do plano do mobile (23/09/2026)

Execução autônoma de `docs/plano-mobile.md`, sem o dono acordado.

## Tempo

- **Início:** 01:54:58 (`date` no começo).
- Fase 0: 01:55 · Fase 1: 02:01 · Fase 2: 02:16 · Fase 3: 02:25 · Fase 4: 02:38 · Fase 5: 02:45 ·
  Fase 6: 02:51.
- ⚠️ **A sessão foi interrompida durante a fase 6** (entre 02:51 e a retomada) e só voltou às
  **11:57**. O trabalho das seis fases coube em ~1h, dentro do orçamento; o relógio de parede passou
  das 2h30 por causa da interrupção, então na retomada só se fechou a fase 6 e o relatório. Nada novo
  foi aberto depois disso. O desligamento de segurança agendado para ~04:55 aparentemente não
  aconteceu (a máquina estava ligada às 11:57); vale conferir o agendamento.
- **Fim:** logo após 11:57 (commit deste relatório).

## O que entrou, fase por fase

Todas as fases foram feitas. Nenhum push.

| Fase | Commit | O que entrou |
|---|---|---|
| 0, casca | `df0176d` | Stash recuperado. Barra de abas (Painel, Conversas, Pipeline, Mais), folha Mais, `sheet lado="baixo"`, `h-dvh`, viewport `resizes-content`, faixas finas. **Falha conhecida resolvida:** a chave de tema da folha usava `SwitchThumb` fora do Root do Switch e derrubava a página (não era alvo de toque). Projeto `mobile` com `casca.mobile.spec.ts` e `telas.mobile.spec.ts` (sem rolagem lateral, nada abaixo de 12px). |
| 1, conversas | `3a6e913` | Uma tela por vez: `/inbox` só lista, `/inbox/[id]` só conversa com voltar. Chips rolando para o lado com dissolução (`useDissolverLateral`, novo). Linha de estado embaixo do nome (mesma `quemAtende`). Três pontos: quem atende, IA nesta conversa, dados do contato (folha de baixo). Caixa de escrita no estilo do Claude **só no celular**: frase de contexto (textos do AJUSTES-2), campo, "+", pílula do modo, enviar redondo; modo volta a Responder depois de nota/orientação só no celular. Os menus chamam os MESMOS handlers do `ConversationView`. `ContactNotes` ganhou sufixo por instância no canal de realtime (o painel monta duas vezes no celular e o Supabase devolvia o canal já inscrito, derrubando a página). |
| 2, painel e cia. | `6e1f728` | Painel em uma coluna na ordem do desenho via `order`. `Stat` respira 16px no celular e o selo desce quando não cabe. **Variante `pagina` do `Card`** (perde a moldura abaixo de `md`), adotada pelas telas que são o cartão. Equipe: remover num menu da linha, mesma confirmação; campo de convite corrigido (nascia mais baixo em coluna). Perfil: trocar senha numa folha (`useCelular`, novo, porque muda o que o toque abre). Assinatura: botão de pagar preso embaixo com área segura. |
| 3, pipeline | `5336b9f` | Faixa de estágios, um estágio por vez; filtro de estágio some no celular. Busca e gestão viram ícones, atendente vira pílula. Botão **Mover** no card abre folha de estágios (atual marcado, subtítulo "Vira 'Movido pelo time', e a IA não desfaz.") e chama o MESMO `moveCard` do arrastar. Gestão de estágios em tela cheia (variante `gestao` do dialog). |
| 4, agente | `f212a11` | Voltar, título, chave "Agente ativo"; Testar, Ver prompt, Usar um modelo e o modo avançado nos três pontos, abrindo os MESMOS painéis (drawers ganharam abertura controlada; o botão Testar só some no `/agente`, a montagem mantém). Modelo abre folha com descrição (`SeletorDePreset apresentacao="lista"`). Abas presas no topo, salvar preso embaixo. Bancada com abas Conversa/Diagnóstico. |
| 5, entrada | `4a22f04` | Login, cadastro, recuperar e definir senha sem moldura no celular; campo `caixa` com 44px no celular (vale para o app todo). QR: cartão "Está neste celular?" antes do código, sem inventar pareamento. |
| 6, fechamento | `c712a07` | Varredura em 375 e 360px; `rolagem.design.spec.ts` com a regra em 375px. A de 360 achou o rodapé da montagem vazando no passo "O que ele sabe" (corrigido). |

Specs novos do projeto `mobile`: `casca`, `telas` (375 e 360), `conversas`, `paginas`, `pipeline`,
`agente`, `entrada`. Um teste antigo foi **atualizado com motivo** (não apagado):
`telas.design.spec.ts` "os modos do composer dizem PARA ONDE" passou a usar `exact: true`, porque a
frase de contexto do celular, escondida no mesmo composer, fazia o localizador casar duas.

## Decisões PENDENTE (padrão aplicado)

1. Caixa de escrita no estilo do Claude no desktop: **só celular**.
2. Chave da IA nos três pontos no desktop: **só celular**.
3. "Desfazer" ao mover card: **fora** (o desenho tem em 3 lugares).
4. Pipeline travado com conta bloqueada: **fora**, continua sem trava.
5. Modo avançado no celular: **editável**, como hoje.
6. "Ver quem está esperando" abrir no filtro Esperando: **como hoje**.
7. Entrada para Assinatura dentro de Perfil: **fora**.

## Divergências do desenho que não viraram código

- **Contador da aba Conversas:** o desenho mostra em âmbar (esperando); o código mostra o número que
  o trilho já tem (não lidas), na cor da marca. Trocar o que o número conta é decisão sua.
- **Cabeçalho da folha Mais:** o desenho traz avatar, NOME DA PESSOA e "Dono · empresa". O `NavRail`
  não recebe o nome do usuário, então ficou empresa como título e "Dono · WhatsApp conectado"
  embaixo. A linha Agente não mostra o estado ("Agente ativo" em verde) pelo mesmo motivo (o dado
  não chega ao `NavRail`).
- **Placeholders do composer no celular:** o AJUSTES-2 pede "Escreva uma nota para o time" e "Diga à
  IA como seguir"; ficaram os de hoje (um campo só nos dois arranjos).
- **Montagem:** o topo continua "Sair e continuar depois", sem a segunda linha "o progresso fica
  salvo".
- **Voltar do Agente** leva sempre ao Painel (não ao histórico).
- **Cartão de indicador com 16px no celular**, contra a regra dos 24px (decisão de 30/08). Em 375px
  o cartão da operação tem ~170px e com 24 de cada lado o selo vazava. Vale revisar.

## Riscos e o que conferir

- **Zoom do iOS no foco:** os campos usam 13px (`text-apoio`) e o Safari do iPhone dá zoom em campo
  abaixo de 16px ao focar. Não mexi na escala tipográfica; conferir no aparelho.
- **Hidratação sob carga:** no dev server frio, o primeiro toque pode se perder antes de hidratar.
  Os specs do `mobile` esperam `networkidle` e dois usam `toPass`.
- **Área segura, teclado e inércia** não se provam no emulador.

## Resultado final das suítes

- `tsc`, `eslint` e `build`: limpos.
- `sem-login` + `mobile`: 242 passaram e 1 falhou na rodada final ("as tags saíram do cabeçalho");
  **passou 3 de 3 isolado** (`--repeat-each=3`), então é carga (o dev server subiu a frio depois da
  interrupção).
- Com login (`setup`, `logado`, `atendente`, `logado-serial`): 22 passaram, 1 pulado, 2 falharam na
  rodada final ("arrastar um card... PERSISTE" e "marca como lida de verdade"); **os dois passaram
  isolados**. Nas rodadas de cada fase, antes da interrupção, a suíte com login fechou sempre
  **26 passando, 1 pulado**.

## Como testar no celular de verdade

```bash
npm run dev -- --hostname 0.0.0.0 --port 3001
```

Depois abrir `http://<ip-do-pc>:3001` no celular, na mesma rede Wi-Fi. As telas `/design/*` abrem
sem login; o resto pede login normal.
