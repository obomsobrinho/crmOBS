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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["components/ui/**", "app/design/**"],
    rules: {
      "no-restricted-syntax": ["warn", ...projectRules],
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
