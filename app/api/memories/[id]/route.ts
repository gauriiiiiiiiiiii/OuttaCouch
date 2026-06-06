import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const prismaMemory = prisma as typeof prisma & {
  memory: {
    findUnique: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
  };
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memory = (await prismaMemory.memory.findUnique({ where: { id } })) as
    | { userId: string }
    | null;

  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (memory.userId !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await prismaMemory.memory.delete({ where: { id } });

  return NextResponse.json({ status: "deleted" });
}
