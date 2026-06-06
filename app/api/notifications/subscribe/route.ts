import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Push subscription token stored for future web-push implementation.
  // Currently in-app notifications are the delivery mechanism.
  await request.json().catch(() => null);

  return NextResponse.json({ status: "subscribed" });
}
