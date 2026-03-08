import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

type CreateMemoryBody = {
  imageUrl?: string;
  caption?: string;
  eventId?: string;
};

type MemoryRecord = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: Date;
  event?: {
    id: string;
    title: string;
    eventDate: Date;
    category: string;
  } | null;
};

const prismaMemory = prisma as typeof prisma & {
  memory: {
    findMany: (args: unknown) => Promise<unknown[]>;
    create: (args: unknown) => Promise<unknown>;
  };
};

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memories = (await prismaMemory.memory.findMany({
    where: { userId: token.sub },
    include: { event: true },
    orderBy: { createdAt: "desc" }
  })) as MemoryRecord[];

  return NextResponse.json({
    memories: memories.map((memory: MemoryRecord) => ({
      id: memory.id,
      imageUrl: memory.imageUrl,
      caption: memory.caption,
      createdAt: memory.createdAt.toISOString(),
      event: memory.event
        ? {
            id: memory.event.id,
            title: memory.event.title,
            date: memory.event.eventDate.toISOString(),
            category: memory.event.category
          }
        : null
    }))
  });
}

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateMemoryBody;
  const imageUrl = body.imageUrl?.trim();

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
  }

  const memory = await prismaMemory.memory.create({
    data: {
      userId: token.sub,
      eventId: body.eventId ?? null,
      imageUrl,
      caption: body.caption ?? null
    }
  });

  return NextResponse.json({ id: (memory as { id: string }).id });
}
