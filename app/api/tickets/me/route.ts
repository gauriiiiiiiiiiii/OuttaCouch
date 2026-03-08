import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId: token.sub },
    include: { event: true }
  });

  const data = tickets.map((ticket) => ({
    id: ticket.id,
    eventTitle: ticket.event.title,
    eventDate: ticket.event.eventDate.toISOString(),
    quantity: ticket.quantity,
    amountPaid: ticket.amountPaid.toString(),
    qrCode: ticket.qrCode
  }));

  return NextResponse.json({ tickets: data });
}
