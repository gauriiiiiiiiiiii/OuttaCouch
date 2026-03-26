import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import { normalizeContact } from "@/lib/normalizeContact";

/**
 * Sync contacts from device
 * POST /api/contacts/sync
 * Body: { contacts: Array<{name: string, phone: string, email?: string}> }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    contacts: Array<{
      name: string;
      phone: string;
      email?: string;
    }>;
  };

  if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
    return NextResponse.json(
      { error: "Invalid contacts array" },
      { status: 400 }
    );
  }

  try {
    const syncedContacts: Array<{
      id: string;
      name: string;
      phone: string;
      status: "registered" | "pending";
      registeredUser: { id: string; displayName: string | null; isDeactivated: boolean } | null;
    }> = [];
    const errors: Array<{ contact: string; error: string }> = [];

    // Delete existing imports for fresh sync
    await prisma.contactImport.deleteMany({
      where: { userId: session.user.id }
    });

    for (const contact of body.contacts) {
      try {
        const normalizedPhone = normalizeContact(contact.phone);

        if (!normalizedPhone) {
          errors.push({
            contact: contact.name,
            error: "Invalid phone format"
          });
          continue;
        }

        // Check if contact is already a registered user
        let registeredUser = await prisma.user.findFirst({
          where: {
            phone: normalizedPhone
          },
          select: { id: true, displayName: true, isDeactivated: true }
        });

        // Create contact import record
        const imported = await prisma.contactImport.create({
          data: {
            userId: session.user.id,
            name: contact.name,
            phone: normalizedPhone,
            status: registeredUser ? "registered" : "pending",
            registeredUserId: registeredUser?.id || null
          }
        });

        syncedContacts.push({
          id: imported.id,
          name: contact.name,
          phone: normalizedPhone,
          status: registeredUser ? "registered" : "pending",
          registeredUser: registeredUser || null
        });

        // Auto-connect if registered user exists and not already connected
        if (registeredUser && !registeredUser.isDeactivated) {
          const existingConnection = await prisma.connection.findFirst({
            where: {
              OR: [
                { user1Id: session.user.id, user2Id: registeredUser.id },
                { user1Id: registeredUser.id, user2Id: session.user.id }
              ]
            }
          });

          if (!existingConnection) {
            await prisma.connection.create({
              data: {
                user1Id: session.user.id,
                user2Id: registeredUser.id,
                status: "accepted",
                acceptedAt: new Date()
              }
            });

            // Create notifications
            await prisma.notification.create({
              data: {
                userId: session.user.id,
                title: "Contact found!",
                body: `${registeredUser.displayName} from your contacts is on Outtacouch`,
                link: "/connections"
              }
            });

            await prisma.notification.create({
              data: {
                userId: registeredUser.id,
                title: "New connection",
                body: `You've been connected with someone from your contacts`,
                link: "/connections"
              }
            });
          }
        }
      } catch (error) {
        errors.push({
          contact: contact.name,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return NextResponse.json({
      message: "Contacts synced successfully",
      syncedCount: syncedContacts.length,
      errorCount: errors.length,
      contacts: syncedContacts,
      errors
    });
  } catch (error) {
    console.error("Contact sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync contacts" },
      { status: 500 }
    );
  }
}

/**
 * Get synced contacts for user
 * GET /api/contacts/sync
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contacts = (await prisma.contactImport.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        invitedAt: true,
        registeredAt: true,
        registeredUser: {
          select: {
            id: true,
            displayName: true,
            profilePhotoUrl: true
          }
        }
      },
      orderBy: { name: "asc" }
    })) as Array<{ status: "registered" | "invited" | "pending" }>;

    const stats = {
      total: contacts.length,
      registered: contacts.filter((contact) => contact.status === "registered").length,
      invited: contacts.filter((contact) => contact.status === "invited").length,
      pending: contacts.filter((contact) => contact.status === "pending").length
    };

    return NextResponse.json({
      stats,
      contacts
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
