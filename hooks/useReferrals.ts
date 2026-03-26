import { useState } from "react";

export interface Invitation {
  id: string;
  phone: string;
  referralCode: string;
  status: "sent" | "clicked" | "registered";
  registeredUser?: {
    id: string;
    displayName: string;
  };
}

export interface ReferralStats {
  totalInvitations: number;
  clicked: number;
  registered: number;
  totalClicks: number;
  totalRegistrations: number;
}

export function useReferrals() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const shareReferralLink = async (
    phones?: string[],
    contactIds?: string[],
    method: "sms" | "whatsapp" = "sms"
  ) => {
    setLoading(true);
    try {
      const response = await fetch("/api/referrals/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones, contactIds, method })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const data = await response.json();
      await fetchStats(); // Refresh stats
      return data.invitations;
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/referrals");
      if (!response.ok) throw new Error("Failed to fetch stats");

      const data = await response.json();
      setStats(data.stats);
      setInvitations(data.invitations);
    } catch (error) {
      console.error("Error fetching referral stats:", error);
    }
  };

  const getReferralLink = (code: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outtacouch.com";
    return `${baseUrl}/join?ref=${code}`;
  };

  return {
    loading,
    stats,
    invitations,
    shareReferralLink,
    fetchStats,
    getReferralLink
  };
}
