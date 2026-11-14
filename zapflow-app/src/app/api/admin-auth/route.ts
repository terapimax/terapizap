import { NextRequest, NextResponse } from "next/server";

// POST /api/admin-auth?action=login  → sets cookie and redirects to /dashboard
// POST /api/admin-auth?action=logout → clears cookie and redirects to /auth/login
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action") ?? "login";

  if (action === "logout") {
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.set("zapflow_admin", "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  }

  // login
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set("zapflow_admin", "true", {
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
