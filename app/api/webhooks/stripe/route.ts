import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const eventId = intent.metadata.eventId;
    const userId = intent.metadata.userId;
    const quantity = Number(intent.metadata.quantity || 1);

    if (eventId && userId) {
      const existingTicket = await prisma.ticket.findFirst({
        where: { paymentIntentId: intent.id }
      });

      if (!existingTicket) {
        const eventRecord = await prisma.event.findUnique({ where: { id: eventId } });
        if (eventRecord) {
          const amountPaid = Number(intent.amount_received || intent.amount || 0) / 100;
          const ticket = await prisma.ticket.create({
            data: {
              eventId,
              userId,
              quantity,
              amountPaid,
              currency: intent.currency.toUpperCase(),
              paymentIntentId: intent.id,
              paymentStatus: "paid",
              qrCode: crypto.randomUUID()
            }
          });

          await prisma.eventAttendee.create({
            data: {
              eventId,
              userId,
              ticketId: ticket.id,
              status: "committed"
            }
          });

          await prisma.event.update({
            where: { id: eventId },
            data: { currentAttendees: { increment: quantity } }
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
