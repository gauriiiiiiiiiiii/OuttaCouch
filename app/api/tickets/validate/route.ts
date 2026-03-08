import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

type ValidateBody = {
  qr_code: string;
  event_id: string;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ValidateBody;
  if (!body.qr_code || !body.event_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: body.event_id } });
  if (!event || event.hostId !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const ticket = await prisma.ticket.findFirst({
    where: { qrCode: body.qr_code, eventId: body.event_id }
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { qrValidated: true, validatedAt: new Date() }
  });

  await prisma.eventAttendee.updateMany({
    where: { ticketId: ticket.id },
    data: { status: "attended" }
  });

  return NextResponse.json({ status: "validated" });
}
