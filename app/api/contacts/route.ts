import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";

type ImportBody = {
  contacts: Array<{ name?: string; phone: string }>;
};

type ContactRow = {
  id: string;
  phone: string;
  name: string | null;
  status: "pending" | "invited" | "registered";
  invitedAt: Date | null;
  registeredAt: Date | null;
  registeredUser: {
    id: string;
    displayName: string | null;
    profilePhotoUrl: string | null;
  } | null;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ImportBody;

  if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }

  if (body.contacts.length > 500) {
    return NextResponse.json({ error: "Maximum 500 contacts allowed" }, { status: 400 });
  }

  try {
    const imported: Array<{ name?: string; phone: string }> = [];
    const duplicates: string[] = [];
    const invalid: string[] = [];

    for (const contact of body.contacts) {
      const normalized = normalizeContact(contact.phone);

      if (!normalized) {
        invalid.push(contact.phone);
        continue;
      }

      // Check if already imported by this user
      const existing = await prisma.contactImport.findUnique({
        where: {
          userId_phone: {
            userId: token.sub,
            phone: normalized
          }
        }
      });

      if (existing) {
        duplicates.push(normalized);
        continue;
      }

      imported.push({ name: contact.name, phone: normalized });
    }

    // Batch create imported contacts
    if (imported.length > 0) {
      const userId = token.sub as string;
      await prisma.contactImport.createMany({
        data: imported.map((c) => ({
          userId,
          phone: c.phone,
          name: c.name ?? null,
          status: "pending"
        })),
        skipDuplicates: true
      });
    }

    return NextResponse.json({
      imported: imported.length,
      duplicates: duplicates.length,
      invalid: invalid.length,
      total: body.contacts.length,
      message: `Imported ${imported.length} contacts successfully`
    });
  } catch (error) {
    console.error("Import contacts error", error);
    return NextResponse.json({ error: "Failed to import contacts" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contacts = (await prisma.contactImport.findMany({
      where: { userId: token.sub },
      select: {
        id: true,
        phone: true,
        name: true,
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
      orderBy: { createdAt: "desc" }
    })) as ContactRow[];

    const stats = {
      total: contacts.length,
      pending: contacts.filter((contact) => contact.status === "pending").length,
      invited: contacts.filter((contact) => contact.status === "invited").length,
      registered: contacts.filter((contact) => contact.status === "registered").length
    };

    return NextResponse.json({ contacts, stats });
  } catch (error) {
    console.error("Fetch contacts error", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}
