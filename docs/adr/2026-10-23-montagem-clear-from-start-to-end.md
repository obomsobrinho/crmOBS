# Montagem clear from start to end: five steps, notices as the last step, confirmed hours, mobile stop

- Date: 2026-10-23
- Status: Accepted (partially supersedes 2026-09-24-montagem-order-inverted-connect-last.md: "conectar e ativar" is now two steps, connect and notices with activation)
- Area: onboarding

## Context
After the first round of testers (2026-10-22), the owner saw people stopping at the end of the montagem. The database on 2026-10-23 showed it:
- 8 accounts were created by testers. 1 activated the agent, 5 saved the agent (steps 1 and 2) and stopped before activating, and 2 never saved anything.
- Saving steps 1 and 2 took 3 to 14 minutes from signup, most around 5.
- The only account that activated took 9 minutes from signup to activation.

The code explained why. Neither the signup (`app/cadastro/page.tsx`) nor steps 1 to 3 mentioned a computer. The notice "open this page on a computer" appeared only inside the connect step, on mobile (`components/ConnectWhatsApp.tsx`, `data-slot="conectar-pelo-computador"`), after the person had already put in all the work. Since 2026-10-17 the QR is the only way to connect (`2026-10-17-pairing-code-off-qr-only.md`), so a person signing up on the company phone cannot finish there. The notices destination, the product's differentiator, was one more block at the bottom of that same step, after the QR.

A second finding: three things that make a real difference had no field in the wizard (`mostrarOpcionais={false}`):
- rules (`dontDo`, `escalateWhen`);
- business hours (`hours`);
- the message shown while the team is called (`handoffNotice`).

Every account went live with the defaults without seeing them. The hours matter more than they look. The wizard saved `hours = DEFAULT_HOURS` (Monday to Friday, 8h to 18h), and `horarioCadastrado` treated any saved value as registered. So the agent said when the company was open, and the turn calendar offered times, from hours nobody chose.

The owner first asked for an in-app "Guia" page (built on 2026-10-23, never committed). He reverted it the same day: after logging in, people understand the app; the only hard part is the montagem, and the primer belongs there.

## Decision
**Five steps** (`PASSOS_MONTAGEM`, `lib/onboarding.ts`):

| # | Step | What it holds |
|---|---|---|
| 1 | Quem atende | Model, company, agent and business hours |
| 2 | O que ele sabe | Details and documents |
| 3 | Teste o seu agente | The bench (renamed by the owner on 2026-10-23; it was "Converse com o seu agente") |
| 4 | Conectar o WhatsApp | The QR only |
| 5 | Quem a IA chama | The notices destination, the review and "Ativar o agente" |

- **Step 4 only connects.** Its "Continuar" stays disabled until the connection is seen on screen (`razao-continuar`). Step 5 needs the WhatsApp connected: the group list comes from the WhatsApp itself and "Mandar teste" leaves from the connected number.
- **Resuming.** A draft that resumes at step 5 without a connection seen opens at step 4, which detects the connection by itself. The server resume point (`montagemState`) is unchanged: configured means `conectar`.
- **Owner's call on step 5** (2026-10-23): a step that depends on the last one makes no sense at the start. The second round had put the notices number in step 1, before connecting.

**Opening** (`components/MontagemAbertura.tsx`):
- Before step 1 it shows a map of the five steps. Each step has its icon (`Bot`, `FileText`, `MessagesSquare`, `QrCode`, `Bell`) on a square in the full tone (`fill`/`on`) of the label palette (`coresDoRotulo`, `lib/rotulos.ts`: violet, blue, cyan, indigo, fuchsia; never a state color), a "Passo N" label and the `resumo`. Step 5 carries the "Faz diferença" tag.
- Step 4 of the map carries `AVISO_COMPUTADOR` right under its summary (owner: the alert belongs to the step it talks about): "Precisa de um computador: você lê o QR com o celular da empresa." On mobile it adds that the first three steps can be done there and the rest on the computer.
- It shows only to someone who has not started: no browser draft, and `passoDoServidor === "quem"`.
- It is not a step: no counter, no rail, and "Começar" opens step 1.
- No estimated time: one finished account is too little data to promise one (owner's decision).

**The step color follows the step, sparingly** (2026-10-26, owner: the opening and the steps must talk to each other, but the whole step in its color was too colorful). `VISUAL_DO_PASSO` and `coresDoPasso` (`components/montagem-visual.ts`) are the single source. The opening shows each step icon on its color, and inside the wizard only two things carry it: the same colored icon next to the step title and the "Passo N de 5" label. The rail, the blocks, the highlights, pills, tabs and buttons stay in the brand. Step 4 keeps the wider column (`max-w-2xl`), where the WhatsApp Web steps and the QR sit side by side; the other steps use `max-w-lg`.

**Highlights** (`Destaque`, `components/agente/ui.tsx`): a brand-framed block with a "Faz diferença" tag, a one-sentence why and a concrete example, placed where the item lives:
- the segment model (step 1, the preset invite);
- business hours (step 1);
- documents (step 2, right after the documents block);
- the notices destination (step 5, `montagem-avisos`, full `AvisosCampo` with number, group and test).

**Confirmed hours**:
- `AgentConfig.hoursConfirmed` exists. `EMPTY_CONFIG` sets it to `false`. Absent in the jsonb means `true`, for configs saved before this date.
- The ready-made Monday to Friday hours are a suggestion until "Este é o nosso horário" or any edit (`CampoHorario`, both surfaces, since it is one component). Saving through `mode: "horario"` also confirms.
- While unconfirmed the hours count nowhere. `buildPersona` omits the hours section, and every read of the stored hours goes through `horarioDaConfig` (`lib/horarios.ts`): `horarioCadastrado` (turn calendar, bench), the Painel and `/assinatura`.
- The fixed configs of the paid suites (`armadilhas.ia`, `horarios.ia`, `fluxos-principais.auth`) carry `hoursConfirmed: true`, so their prompt is unchanged. The paid suites were not run.

**Review before activating** (`components/MontagemRevisao.tsx`; rule `revisaoAntesDeAtivar` and copy `ITENS_DA_REVISAO` in `lib/onboarding.ts`):
- It sits in step 5, after the notices block and before "Ao ativar, o que acontece" and the button.
- Four rows: regras, documentos, horário and mensagem. The notices are the step itself, right above, so they are not a row.
- Each row is ONE line (2026-10-26, owner: "muito texto, ele já passou lá atrás"): a round check when done, the title and the value in a few words ("2 regras", "Conferido", "Padrão"), and only what is missing says "Recomendado" with its button (Adicionar, Conferir, Personalizar). No why and no example: those live in the steps. In the same pass the copy that repeated itself left the steps: the model and hours examples (step 1), the documents example and the long "nada aqui é obrigatório" (step 2), the why inside the notices block and the "avisa que vai verificar" item of "Ao ativar" (step 5), and the closing "esta montagem sai do caminho" line.
- States: `preenchido`, `vazio`, `padrao` (the default message), `nao_conferido` (hours) and `conferindo`. The documents count is ONE head count when the review mounts (`useCarga`).
- Documents go back to step 2. Rules, message and hours open a sheet inside the montagem with the SAME fields as `/agente` (`BlocoLimites`, `CampoHorario`, exported from `components/agente/campos.tsx`). This was the owner's choice over leaving the montagem or adding fields to the steps.
- Closing the sheet any way saves (`form.save()`, which also commits an unadded rule draft). If the server refuses, the sheet stays open with the error.
- The review never blocks: only the notices are required, by `publishBlockers`.
- It ends with "Depois de ativar, cada orientação sua pode virar regra para a próxima vez." This is true: owners have "Salvar como regra" in Pedidos.

**First activation refuses the agent's own number**: `PUT publish` answers 409 when the notices destination is a number equal to the agent's (`ownerNumber`). It blocks only on a clear answer from Evolution. `PUT notify-target` already refuses this when an instance exists, but a number saved in `/agente` before connecting was never compared.

**Step 4 on mobile is a stop** (`components/MontagemParada.tsx`):
- It reads "Continue no computador", with the why in one sentence and the link `/montagem` with "Copiar o link" and "Compartilhar o link" (only where `navigator.share` exists).
- It says the work is saved and the montagem resumes at this step on the computer. This is true: the agent is saved leaving step 2.
- "Mostrar o QR aqui" still reveals the QR, for a company WhatsApp on another phone.
- With an instance already created, one `whatsapp-status` read skips the stop when it is already `open`.
- The mobile notice of `ConnectWhatsApp` no longer shows inside the montagem; it stays on `/connect`.

**Step 4 on the computer**: the WhatsApp Web steps were already there. "Conectar não liga o agente" is the step subtitle, once, highlighted on the brand surface with the power icon.

**Signup**: one discreet line under the trial sentence: "Dica: faça pelo computador. No final você conecta o WhatsApp lendo um QR code."

## History of this delivery (all before any commit)
1. **Four steps.** The notices stayed at the bottom of step 4 ("Conectar e ativar"), and the review had a notices row. Hours were only in the review sheet, flagged "padrão" when equal to `DEFAULT_HOURS` (`horarioEhPadrao`).
2. **Owner's review.** The notices number moved to step 1, before connecting, with the group and the test "depois de conectar". Hours moved into step 1 with `hoursConfirmed`. The opening gained color, icons and a help-request block.
3. **Owner's call.** Step 1 depending on the last step makes no sense. The notices became step 5, and the number in step 1, its "antes de conectar" mode in `AvisosCampo`, the opening's separate block and the review's notices row were removed. Confirmed hours, colors and the publish check stayed.

## Consequences
- `/design/montagem` without `?passo=` opens on the opening, like a new account. `?passo=avisos` opens step 5 already connected, `?passo=conectar&conectado=1` opens step 4 connected, and `?avisos=1` saves a fake destination. `/design/connect?tela=1` previews the full `/connect` screen.
- `mostrarOpcionais` is still the only difference between the two surfaces of the agent form. The wizard composes `CampoHorario` in step 1 and the review sheet; it adds no field.
- Accounts saved before this delivery have no `hoursConfirmed` and count as confirmed. The 6 tester accounts went live with Monday to Friday, 8h to 18h, that nobody chose; the owner decides whether to tell them.
- Copy follows the mixed-audience rule (no segment words, no dash). Every sentence was checked against the code: the AI keeps attending after a handoff, it answers at any hour, and the hours section drives "is it open now".
- Tests:
  - `e2e/montagem.design.spec.ts`: five steps, the order, step 4 waiting for the connection, step 5 with number, group and test, the review (four rows, states, order), the sheet saving, confirmed hours across steps, the pure rules, copy rules, the opening's icons and tag, and the signup line.
  - `e2e/entrada.mobile.spec.ts`: the mobile stop, "Mostrar o QR aqui", the opening on mobile, the review at 375px and the `/connect` notice.
  - `e2e/avisos.design.spec.ts`: the notices block, now in step 5.
  - The cursor and 375/360px sweeps include the new routes.
  - Counter regexes in `ajustes` and `onboarding` no longer pin "de 4".
