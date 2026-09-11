# E-mails do Supabase Auth: texto dos quatro templates

Escrito em 11/09/2026 (C2 do plano da demo). Os e-mails que o Supabase manda hoje dizem
"DeskCRM", nome que não existe mais, e têm assunto em inglês (achado A3 do `handoff.md`). O texto
**não mora no repositório**: mora no painel do Supabase, em Authentication, Emails, Templates.
**Aplicar é do dono**, não existe ferramenta para editar daqui. Este arquivo é a cópia de referência,
para o texto ter diff e revisão como o resto do produto.

## Antes de colar

- **Sender name** (Authentication, Emails, SMTP Settings): usar o mesmo nome de `lib/brand.ts`
  (`BRAND.name`, hoje "O Bom Sobrinho"). Se a marca trocar, o remetente troca junto, senão o
  e-mail chega com um nome e a tela abre com outro.
- **Nenhum template cita nome de produto.** O `CLAUDE.md` diz que o nome ainda não existe, então o
  corpo fala do **atendimento da empresa do tenant**, que é o que a pessoa reconhece.
- **Variáveis** (conferidas na doc de Email Templates do Supabase em 11/09/2026):
  `{{ .ConfirmationURL }}` (o link pronto, já com o `redirectTo` que a rota passou),
  `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .TokenHash }}`, `{{ .Token }}`, `{{ .Email }}`,
  `{{ .NewEmail }}` e `{{ .Data }}` (o `user_metadata` do usuário; `{{ .Data.company_name }}` é o
  campo que `/api/signup` e `/api/team/invite` gravam ao convidar).
- O link de todos cai em **`/auth/confirm?next=/definir-senha`** (é o `redirectTo` das três
  rotas: cadastro, convite, recuperar senha), que grava a sessão e manda para a tela de senha.
  `{{ .ConfirmationURL }}` já embute isso. Se um dia o link passar a ser montado à mão, a rota
  também aceita `token_hash` + `type`.
- Regras de escrita do projeto valem aqui: **sem travessão**, "você" em minúscula, frases curtas.

## 1. Invite user (cadastro E convite de equipe)

⚠️ **Um template para dois casos.** Quem criou a própria conta em `/cadastro` e quem foi chamado
por um dono em `/equipe` recebem o MESMO e-mail. "Você foi convidado" está errado para metade das
pessoas; "Bem-vindo" está errado para a outra metade. O texto é neutro de propósito.

**Assunto:** `Defina sua senha para entrar no atendimento de {{ .Data.company_name }}`

**Corpo (HTML):**

```html
<h2>Defina sua senha</h2>
<p>Sua conta no atendimento de <strong>{{ .Data.company_name }}</strong> está pronta. Falta só
escolher uma senha.</p>
<p><a href="{{ .ConfirmationURL }}">Definir minha senha</a></p>
<p>O link vale por 24 horas e funciona uma vez. Se ele expirar, peça um novo em
<a href="{{ .SiteURL }}/recuperar-senha">{{ .SiteURL }}/recuperar-senha</a>.</p>
<p>Se você não esperava este e-mail, pode ignorar: nada acontece sem a senha.</p>
```

Se `company_name` vier vazio (conta criada por outro caminho), o Go template aceita condicional:

```html
{{ if .Data.company_name }}Sua conta no atendimento de <strong>{{ .Data.company_name }}</strong>
está pronta.{{ else }}Sua conta está pronta.{{ end }}
```

## 2. Confirm signup (confirmação de e-mail)

O app **não usa `signUp`**: o cadastro vai por `inviteUserByEmail`, então este template só dispara
se alguém criar usuário por outro caminho (painel do Supabase, por exemplo). Fica em português
mesmo assim, para não sobrar um e-mail em inglês.

**Assunto:** `Confirme seu e-mail`

**Corpo (HTML):**

```html
<h2>Confirme seu e-mail</h2>
<p>Recebemos um pedido para criar uma conta com o endereço <strong>{{ .Email }}</strong>.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar e-mail</a></p>
<p>Se você não fez esse pedido, pode ignorar este e-mail.</p>
```

## 3. Reset password (recuperação de senha)

Disparado por `/recuperar-senha` (`resetPasswordForEmail`, direto do browser). A tela responde
igual para qualquer e-mail, existente ou não, e o e-mail segue a mesma linha: não confirma nem
nega que a conta existe.

**Assunto:** `Redefinir sua senha`

**Corpo (HTML):**

```html
<h2>Redefinir sua senha</h2>
<p>Alguém pediu para redefinir a senha da conta <strong>{{ .Email }}</strong>.</p>
<p><a href="{{ .ConfirmationURL }}">Escolher uma nova senha</a></p>
<p>O link vale por uma hora e funciona uma vez.</p>
<p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
```

## 4. Change email address (troca de e-mail)

Não existe tela para trocar e-mail no app hoje (`/perfil` troca só a senha). O template fica
pronto para quando existir. Por padrão o Supabase pede confirmação nos **dois** endereços
("Secure email change"), então o texto cita o novo e o antigo.

**Assunto:** `Confirme a troca de e-mail`

**Corpo (HTML):**

```html
<h2>Confirme a troca de e-mail</h2>
<p>Recebemos um pedido para trocar o e-mail de acesso de <strong>{{ .Email }}</strong> para
<strong>{{ .NewEmail }}</strong>.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar a troca</a></p>
<p>Se não foi você, não clique e troque sua senha em
<a href="{{ .SiteURL }}/perfil">{{ .SiteURL }}/perfil</a>.</p>
```

## O que mudou no código

`app/api/team/invite/route.ts` passa `data: { company_name: mine.name }` no `inviteUserByEmail`,
como `/api/signup` já fazia. Sem isso o template 1 chegaria ao convidado de equipe com o nome da
empresa em branco.

## O que NÃO está coberto

- **Reauthentication** e as notificações de segurança (senha alterada, e-mail alterado): o app
  não dispara nenhuma delas hoje. Ficam com o texto padrão até alguém precisar.
- **Prazo dos links**: 24 horas e 1 hora são os padrões do Supabase (Authentication, Emails,
  "OTP expiry"). Se o dono mudar o prazo no painel, mudar o número no texto junto.
