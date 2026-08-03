import { NextResponse, type NextRequest } from "next/server";

/**
 * O Aion não usa Server Actions ("use server").
 * Scanners (React2Shell / CVE probes) enviam POST com `next-action` lixo
 * (ex.: "3f6c8f1a", zeros) e poluem o log do Railway.
 * Rejeitamos cedo com 400.
 */
export function middleware(req: NextRequest) {
  if (req.method === "POST") {
    const action = req.headers.get("next-action") ?? req.headers.get("Next-Action");
    if (action != null) {
      return new NextResponse("Bad Request", { status: 400 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
