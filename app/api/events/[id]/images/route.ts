import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

type ImagePayload = {
  imageUrl?: string;
  isCover?: boolean;
  orderIndex?: number;
  imageId?: string;
  direction?: "up" | "down";
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const images = await prisma.eventImage.findMany({
    where: { eventId: params.id },
    orderBy: { orderIndex: "asc" }
  });

  return NextResponse.json({ images });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { hostId: true }
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (event.hostId !== token.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as ImagePayload;
  const imageUrl = body.imageUrl?.trim();

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
  }

  if (body.isCover) {
    await prisma.event.update({
      where: { id: params.id },
      data: { coverImageUrl: imageUrl }
    });
    await prisma.eventImage.updateMany({
      where: { eventId: params.id, isCover: true },
      data: { isCover: false }
    });
  }

  const orderIndex =
    body.orderIndex ?? (await prisma.eventImage.count({ where: { eventId: params.id } }));

  const image = await prisma.eventImage.create({
    data: {
      eventId: params.id,
      imageUrl,
      isCover: Boolean(body.isCover),
      orderIndex
    }
  });

  return NextResponse.json({ image });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { hostId: true }
  });

  if (!event || event.hostId !== token.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as ImagePayload;
  if (!body.imageId) {
    return NextResponse.json({ error: "Missing imageId" }, { status: 400 });
  }

  if (body.isCover) {
    const image = await prisma.eventImage.findUnique({ where: { id: body.imageId } });
    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.event.update({
      where: { id: params.id },
      data: { coverImageUrl: image.imageUrl }
    });
    await prisma.eventImage.updateMany({
      where: { eventId: params.id, isCover: true },
      data: { isCover: false }
    });
    await prisma.eventImage.update({
      where: { id: body.imageId },
      data: { isCover: true }
    });
    return NextResponse.json({ status: "ok" });
  }

  if (body.direction) {
    const images = await prisma.eventImage.findMany({
      where: { eventId: params.id },
      orderBy: { orderIndex: "asc" }
    });
    const index = images.findIndex((image) => image.id === body.imageId);
    if (index < 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const swapIndex = body.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= images.length) {
      return NextResponse.json({ status: "ok" });
    }
    const current = images[index];
    const swap = images[swapIndex];
    await prisma.$transaction([
      prisma.eventImage.update({
        where: { id: current.id },
        data: { orderIndex: swap.orderIndex }
      }),
      prisma.eventImage.update({
        where: { id: swap.id },
        data: { orderIndex: current.orderIndex }
      })
    ]);
    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({ status: "noop" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { hostId: true }
  });

  if (!event || event.hostId !== token.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { imageId?: string };
  if (!body.imageId) {
    return NextResponse.json({ error: "Missing imageId" }, { status: 400 });
  }

  await prisma.eventImage.delete({ where: { id: body.imageId } });
  return NextResponse.json({ status: "deleted" });
}
