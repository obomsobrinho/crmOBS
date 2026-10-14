import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoDoAdmin, ehAdminPeloAmbiente } from "@/lib/admin-acesso";

// Next 16: o antigo "middleware" agora se chama "proxy". Renova a sessão do
// Supabase a cada request e protege as rotas do app (exige login).
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // NÃO colocar código entre createServerClient e getClaims().
  // `getClaims()` confere assinatura e validade do JWT localmente (chave pública
  // em cache) e só vai à rede para renovar um token vencido, o que também regrava
  // o cookie por `setAll`. `getUser()` aqui custava uma ida ao Auth em TODA
  // navegação (R-08, 01/10/2026). Rota que escreve algo sensível reconfere no
  // Auth por conta própria (`revalidar`, lib/rota.ts).
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;

  // ADMIN (P1 item 6; decisão de 29/09/2026): `/admin` e `/api/admin` são 404
  // para quem não está em `ADMIN_USER_IDS` (inclusive sem login), para nem
  // revelar que existem. É a primeira trava; a página e cada rota conferem de
  // novo no servidor (`adminDaSessao`, lib/admin.ts).
  if (caminhoDoAdmin(pathname) && !ehAdminPeloAmbiente(user?.sub)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const isPublic =
    pathname.startsWith("/login") ||
    // Cadastro self-service e recuperação de senha: quem chega aqui não tem
    // sessão por definição.
    pathname.startsWith("/cadastro") ||
    pathname.startsWith("/recuperar-senha") ||
    pathname.startsWith("/auth") ||
    // Página de preview de design — só existe em desenvolvimento.
    (process.env.NODE_ENV !== "production" && pathname.startsWith("/design")) ||
    // Route Handlers cuidam da própria autenticação (sessão ou secret do n8n).
    pathname.startsWith("/api");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
