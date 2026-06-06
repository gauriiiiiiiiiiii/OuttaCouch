import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== token.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.notification.delete({ where: { id } });

  return NextResponse.json({ status: "deleted" });
}
