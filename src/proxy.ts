import { NextResponse, type NextRequest } from "next/server";

/**
 * בדיקה אופטימית בלבד (קיום עוגייה), בלי גישה ל־DB.
 * האימות האמיתי מתבצע ב־src/lib/auth/dal.ts בכל דף ופעולה.
 */
const PUBLIC_PATHS = ["/login", "/login/verify", "/signup", "/forgot-password", "/reset-password", "/api/health"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const hasSession = req.cookies.has("session");

  if (!isPublic && !hasSession) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/" && pathname !== "/audit") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
