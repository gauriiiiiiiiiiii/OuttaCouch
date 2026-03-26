/**
 * DEPRECATED: Use /api/referrals instead
 * 
 * This endpoint has been consolidated.
 * Use the following endpoints for contact and referral management:
 * - POST /api/referrals - Share referral links
 * - GET /api/referrals - Get referral stats
 * - POST /api/contacts/sync - Sync device contacts
 * - GET /api/contacts/sync - Get synced contacts
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use /api/referrals instead.",
      documentation: "See INTEGRATION_GUIDE.md for updated endpoints"
    },
    { status: 410 } // Gone
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use /api/referrals instead.",
      documentation: "See INTEGRATION_GUIDE.md for updated endpoints"
    },
    { status: 410 } // Gone
  );
}

