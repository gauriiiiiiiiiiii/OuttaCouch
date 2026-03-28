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

  const connection = await prisma.connection.findUnique({
    where: { id }
  });

  if (!connection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (connection.user1Id !== token.sub && connection.user2Id !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  if (connection.status === "removed") {
    return NextResponse.json({ status: "removed" });
  }

  const updated = await prisma.connection.update({
    where: { id },
    data: { status: "removed" }
  });

  return NextResponse.json({ status: updated.status });
}
