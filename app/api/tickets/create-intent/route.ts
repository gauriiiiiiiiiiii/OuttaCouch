import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

type IntentBody = {
  eventId: string;
  quantity: number;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = (await request.json()) as IntentBody;
  const event = await prisma.event.findUnique({ where: { id: body.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (event.isFree) {
    return NextResponse.json({ error: "Free event" }, { status: 400 });
  }

  const quantity = Math.max(1, Math.min(body.quantity || 1, 4));
  const total = Number(event.ticketPrice || 0) * quantity;

  const amount = Math.round(total * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: event.currency.toLowerCase(),
    metadata: {
      eventId: event.id,
      userId: token.sub,
      quantity: String(quantity)
    }
  });

  return NextResponse.json({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    amount: total,
    currency: event.currency
  });
}
