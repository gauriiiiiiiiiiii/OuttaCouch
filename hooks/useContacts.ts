import { useCallback, useState } from "react";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: "pending" | "invited" | "registered";
  invitedAt?: Date;
  registeredAt?: Date;
  registeredUser?: {
    id: string;
    displayName: string;
    profilePhotoUrl?: string;
  };
}

export interface ContactStats {
  total: number;
  registered: number;
  invited: number;
  pending: number;
}

export function useContacts() {
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);

  const syncContacts = useCallback(
    async (
      deviceContacts: Array<{
        name: string;
        phone: string;
        email?: string;
      }>
    ) => {
      setLoading(true);
      try {
        const response = await fetch("/api/contacts/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: deviceContacts })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }

        const data = await response.json();
        setContacts(data.contacts);
        setStats(data);
        return data;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchContacts = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/sync");
      if (!response.ok) throw new Error("Failed to fetch contacts");

      const data = await response.json();
      setContacts(data.contacts);
      setStats(data.stats);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  }, []);

  const requestPhoneAccess = useCallback(async () => {
    // This would use device APIs to request phone contact access
    // Implementation depends on platform (Web Contact API, React Native, etc.)
    if ("contacts" in navigator) {
      try {
        const contactList = await (navigator as any).contacts.getProperties([
          "name",
          "tel",
          "email"
        ]);
        const properties = await Promise.all(contactList);

        return properties.map((contact: any) => ({
          name: contact.name?.[0] || "Unknown",
          phone: contact.tel?.[0]?.value || "",
          email: contact.email?.[0] || ""
        }));
      } catch (error) {
        throw new Error("Failed to access contacts");
      }
    }
    throw new Error("Contact API not supported");
  }, []);

  const inviteContacts = useCallback(
    async (contactIds: string[], channel: "sms" | "whatsapp" = "sms") => {
      setLoading(true);
      try {
        const response = await fetch("/api/referrals/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds, channel })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }

        await fetchContacts(); // Refresh contacts
        return await response.json();
      } finally {
        setLoading(false);
      }
    },
    [fetchContacts]
  );

  return {
    loading,
    contacts,
    stats,
    syncContacts,
    fetchContacts,
    inviteContacts,
    requestPhoneAccess
  };
}
