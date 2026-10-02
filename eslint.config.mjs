import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Project rules that a machine can check. Each one mirrors a line in
// .claude/rules/engineering.md; the "why" is in docs/adr/.
// They start as WARNINGS so `npm run lint` keeps passing with the legacy
// violations. The PostToolUse hook (.claude/hooks/lint.mjs) runs eslint with
// --max-warnings 0 on every file Claude edits, so a touched file must be clean.
const projectRules = [
  {
    selector:
      "JSXOpeningElement[name.name=/^(button|input|textarea|select)$/]",
    message:
      "Use the base layer (components/ui: Button, Input, Textarea, Select). See docs/design-system/camada-base.md.",
  },
  {
    selector:
      "JSXAttribute[name.name='className'] Literal[value=/overflow-(y-)?auto/]",
    message:
      "Scrollable areas use <AreaRolavel> or ScrollArea with fade (components/ui/dissolver-rolagem.tsx).",
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/overflow-(y-)?auto/]",
    message:
      "Scrollable areas use <AreaRolavel> or ScrollArea with fade (components/ui/dissolver-rolagem.tsx).",
  },
  {
    selector: "CallExpression[callee.property.name='select'] > Literal[value='*']",
    message: "List explicit columns in select(). See .claude/rules/engineering.md.",
  },
  {
    selector: "CallExpression[callee.property.name='limit'] > Literal[value>=100]",
    message:
      "Lists paginate 10 at a time (lib/use-paginada.ts) and counts are aggregate queries. A limit this high means fetching to filter in memory.",
  },
  {
    selector:
      "CallExpression[callee.property.name='subscribe'][arguments.length=0]",
    message:
      "Never subscribe without a status callback; refetch on SUBSCRIBED after the first (docs/adr/2026-08-31-realtime-subscribe-callback-and-focus-refetch.md).",
  },
  {
    selector: "CallExpression[callee.property.name='channel']",
    message:
      "Never open a realtime channel by hand: use useCanalTenant / useCanalConversa (lib/use-canal-ao-vivo.ts). It owns the session, the status callback, the focus refetch and the hidden tab.",
  },
  {
    selector:
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message:
      "No `as unknown as`: derive the type from lib/database.types.ts (Tables, Pick, lib/supabase/schema.ts). A real library typing gap gets a disable with the reason (docs/adr/2026-10-02-generated-supabase-types.md).",
  },
  {
    selector: "Literal[value=/[\\u2013\\u2014]/]",
    message: "No em dash or en dash in user-visible text or prompts. Use comma, colon or parentheses.",
  },
  {
    selector: "TemplateElement[value.raw=/[\\u2013\\u2014]/]",
    message: "No em dash or en dash in user-visible text or prompts. Use comma, colon or parentheses.",
  },
  {
    selector: "JSXText[value=/[\\u2013\\u2014]/]",
    message: "No em dash or en dash in user-visible text. Use comma, colon or parentheses.",
  },
];

// Checks from the audit (F13, 02/10/2026). Each group mirrors a prose rule in
// engineering.md / ui.md. Warnings because of legacy code; the hook still
// demands zero warnings on the file being edited.
const regrasDeFuso = [
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
    message:
      "Dates and numbers on screen come from lib/format.ts or lib/fuso.ts (FUSO). No loose toLocale*String (docs/adr/2026-09-27-dates-on-screen-use-sao-paulo-timezone.md).",
  },
  {
    selector: "Literal[value='America/Sao_Paulo']",
    message: "The time zone string lives only in lib/fuso.ts (FUSO). Import it.",
  },
];
const regraDeMensagem = [
  {
    selector: "BinaryExpression[operator=/^[=!]==?$/]:has(Literal[value='manual'])",
    message:
      "Who replied (AI, human, imported) is decided only in lib/mensagem.ts. Call it instead of comparing message_type with 'manual'.",
  },
];
const regraDeRefresh = [
  {
    selector: "CallExpression[callee.property.name='refresh'][callee.object.name='router']",
    message:
      "router.refresh() only for authentication or tenant changes (login, logout). A mutation updates local state or the affected row (.claude/rules/engineering.md).",
  },
];
const regrasGerais = [
  {
    selector:
      "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='disabled'] Identifier[name=/^(loading|saving|sending|busy|uploading|pending)$/]",
    message:
      "An async Button uses the carregando prop, not disabled (docs/adr/2026-09-26-button-carregando-prop.md).",
  },
  {
    selector:
      "JSXAttribute[name.name='className'] Literal[value=/(^|[\\s:])(text-white|bg-white|bg-black)\\b/]",
    message:
      "No text-white, bg-white or bg-black outside components/ui: use the tokens in app/globals.css (docs/design-system/fundamentos-cor.md).",
  },
];
const conjunto = ({ fuso = true, mensagem = true, refresh = true } = {}) => [
  ...projectRules,
  ...regrasGerais,
  ...(fuso ? regrasDeFuso : []),
  ...(mensagem ? regraDeMensagem : []),
  ...(refresh ? regraDeRefresh : []),
];
// router.refresh() is legitimate on login, logout and account switch.
const REFRESH_PERMITIDO = [
  "app/login/page.tsx",
  "app/definir-senha/page.tsx",
  "components/LogoutButton.tsx",
  "components/NavRail.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["components/ui/**", "app/design/**"],
    rules: {
      "no-restricted-syntax": ["warn", ...conjunto()],
    },
  },
  {
    files: ["lib/format.ts", "lib/fuso.ts"],
    rules: { "no-restricted-syntax": ["warn", ...conjunto({ fuso: false })] },
  },
  {
    files: ["lib/mensagem.ts"],
    rules: { "no-restricted-syntax": ["warn", ...conjunto({ mensagem: false })] },
  },
  {
    files: REFRESH_PERMITIDO,
    rules: { "no-restricted-syntax": ["warn", ...conjunto({ refresh: false })] },
  },
  // service_role never enters code that runs in the browser. ERROR, not warning:
  // there are zero occurrences today.
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/service", "**/supabase/service"],
              message:
                "service_role is server-only: never import lib/supabase/service from a component (.claude/rules/engineering.md).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copias isoladas dos subagentes (git worktree): nao sao codigo deste checkout.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
