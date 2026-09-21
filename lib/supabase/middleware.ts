import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return new NextResponse(
      "Setup needed: the Supabase settings are missing.\n\n" +
        "In Vercel open your project, go to Settings > Environment Variables, and add:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL\n" +
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
        "Then go to Deployments and redeploy.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not put any code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const onLoginPage = path.startsWith("/login");

  const redirectTo = (target: string) => {
    const dest = request.nextUrl.clone();
    dest.pathname = target;
    dest.search = "";
    const redirect = NextResponse.redirect(dest);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!user && !onLoginPage) return redirectTo("/login");
  if (user && onLoginPage) return redirectTo("/");

  return response;
}
