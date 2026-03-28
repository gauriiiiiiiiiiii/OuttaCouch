import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (event.hostId !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const pad = (value: number) => value.toString().padStart(2, "0");
  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  return NextResponse.json({
    id: event.id,
    title: event.title,
    descriptionShort: event.descriptionShort,
    descriptionFull: event.descriptionFull,
    category: event.category,
    eventDate: formatDate(event.eventDate),
    startTime: formatTime(event.startTime),
    endDate: event.endTime ? formatDate(event.endTime) : formatDate(event.eventDate),
    endTime: event.endTime ? formatTime(event.endTime) : "",
    venueName: event.venueName,
    address: event.address,
    lat: Number(event.lat),
    lng: Number(event.lng),
    isFree: event.isFree,
    ticketPrice: event.ticketPrice ? Number(event.ticketPrice) : null,
    maxAttendees: event.maxAttendees,
    coverImageUrl: event.coverImageUrl
  });
}
