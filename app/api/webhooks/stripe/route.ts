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

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const eventId = intent.metadata?.eventId;
        const userId = intent.metadata?.userId;
        const quantity = Number(intent.metadata?.quantity || 1);

        if (eventId && userId) {
          const existingTicket = await prisma.ticket.findFirst({
            where: { paymentIntentId: intent.id }
          });

          if (!existingTicket) {
            const eventRecord = await prisma.event.findUnique({ where: { id: eventId } });
            if (eventRecord) {
              const amountPaid = Number(intent.amount_received || intent.amount || 0) / 100;
              const qrCode = crypto.randomUUID();
              
              const ticket = await prisma.ticket.create({
                data: {
                  eventId,
                  userId,
                  quantity,
                  amountPaid,
                  currency: intent.currency.toUpperCase(),
                  paymentIntentId: intent.id,
                  paymentStatus: "paid",
                  qrCode
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
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const existingTicket = await prisma.ticket.findFirst({
          where: { paymentIntentId: intent.id }
        });

        if (existingTicket) {
          await prisma.ticket.update({
            where: { id: existingTicket.id },
            data: { paymentStatus: "failed" }
          });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent && typeof charge.payment_intent === "string") {
          const ticket = await prisma.ticket.findFirst({
            where: { paymentIntentId: charge.payment_intent }
          });

          if (ticket && ticket.paymentStatus === "paid") {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { paymentStatus: "refunded" }
            });

            await prisma.eventAttendee.deleteMany({
              where: { ticketId: ticket.id }
            });

            await prisma.event.update({
              where: { id: ticket.eventId },
              data: { currentAttendees: { decrement: ticket.quantity } }
            });
          }
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.payment_intent && typeof dispute.payment_intent === "string") {
          const ticket = await prisma.ticket.findFirst({
            where: { paymentIntentId: dispute.payment_intent }
          });

          if (ticket) {
            // Log the dispute but don't auto-fail the ticket
            console.warn(`Stripe dispute created for ticket ${ticket.id}: ${dispute.id}`);
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing error";
    console.error(`Stripe webhook error for event ${event.type}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
