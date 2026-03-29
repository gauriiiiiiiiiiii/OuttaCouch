"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import { navigateToProfile } from "@/lib/navigateToProfile";

type Suggestion = {
  userId: string;
  name: string;
  photo?: string | null;
  sharedEventTitle?: string | null;
  sharedEventId?: string | null;
  sharedCount: number;
};

type Connection = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
};

type ConnectionRequest = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
  sharedEventId?: string | null;
  sharedEventTitle?: string | null;
  requestedAt: string;
};

export default function ConnectionsPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [suggestionsRes, connectionsRes, requestsRes] = await Promise.all([
        fetch("/api/connections/suggestions"),
        fetch("/api/connections"),
        fetch("/api/connections/requests")
      ]);
      const suggestionsData = suggestionsRes.ok
        ? ((await suggestionsRes.json()) as { suggestions: Suggestion[] })
        : { suggestions: [] };
      const connectionsData = connectionsRes.ok
        ? ((await connectionsRes.json()) as { connections: Connection[] })
        : { connections: [] };
      const requestsData = requestsRes.ok
        ? ((await requestsRes.json()) as { requests: ConnectionRequest[] })
        : { requests: [] };

      if (active) {
        setSuggestions(suggestionsData.suggestions ?? []);
        setConnections(connectionsData.connections ?? []);
        setRequests(requestsData.requests ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleConnect = async (suggestion: Suggestion) => {
    await fetch(`/api/connections/request/${suggestion.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedEventId: suggestion.sharedEventId ?? null })
    });
    setSuggestions((prev) => prev.filter((item) => item.userId !== suggestion.userId));
  };


  const handleAccept = async (request: ConnectionRequest) => {
    await fetch(`/api/connections/${request.id}/accept`, { method: "PUT" });
    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    setConnections((prev) => [
      ...prev,
      {
        id: request.id,
        userId: request.userId,
        name: request.name,
        photo: request.photo
      }
    ]);
  };

  const handleDecline = async (request: ConnectionRequest) => {
    await fetch(`/api/connections/${request.id}/decline`, { method: "PUT" });
    setRequests((prev) => prev.filter((item) => item.id !== request.id));
  };


  return (
    <PageShell title="Connections" subtitle="Suggested based on shared events.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading connections...
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Your connections</h2>
                <p className="text-sm text-neutral-500">
                  {connections.length} {connections.length === 1 ? "person" : "people"} connected with you.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {connections.length === 0 ? (
                <p className="text-sm text-neutral-600">No connections yet. Start connecting with people you meet at events!</p>
              ) : (
                connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-4"
                  >
                    <button
                      type="button"
                      onClick={() => navigateToProfile(router, connection.userId)}
                      className="relative h-12 w-12 rounded-full bg-neutral-200 flex-shrink-0 overflow-hidden"
                      aria-label={`View ${connection.name}`}
                    >
                      {connection.photo ? (
                        <Image
                          src={connection.photo}
                          alt={connection.name}
                          fill
                          sizes="48px"
                          className="rounded-full object-cover"
                        />
                      ) : null}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{connection.name}</p>
                      <p className="text-xs text-neutral-500">Connected</p>
                    </div>
                    <Link
                      href={`/chat/${connection.id}`}
                      className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                    >
                      Message
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Requests</h2>
                <p className="text-sm text-neutral-500">
                  Accept or decline connection requests.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-neutral-600">No requests right now.</p>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white/95 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigateToProfile(router, request.userId)}
                        className="relative h-12 w-12 rounded-full bg-neutral-200 overflow-hidden"
                        aria-label={`View ${request.name}`}
                      >
                        {request.photo ? (
                          <Image
                            src={request.photo}
                            alt={request.name}
                            fill
                            sizes="48px"
                            className="rounded-full object-cover"
                          />
                        ) : null}
                      </button>
                      <div>
                        <p className="text-sm font-semibold">{request.name}</p>
                        <p className="text-xs text-neutral-500">
                          Shared: {request.sharedEventTitle ?? "Event"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecline(request)}
                        className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(request)}
                        className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Suggested</h2>
                <p className="text-sm text-neutral-500">
                  People you might know from shared events.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {suggestions.length === 0 ? (
                <p className="text-sm text-neutral-600">No suggestions yet.</p>
              ) : (
                suggestions.map((suggestion) => (
                  <div
                    key={suggestion.userId}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white/95 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigateToProfile(router, suggestion.userId)}
                        className="relative h-12 w-12 rounded-full bg-neutral-200 overflow-hidden"
                        aria-label={`View ${suggestion.name}`}
                      >
                        {suggestion.photo ? (
                          <Image
                            src={suggestion.photo}
                            alt={suggestion.name}
                            fill
                            sizes="48px"
                            className="rounded-full object-cover"
                          />
                        ) : null}
                      </button>
                      <div>
                        <p className="text-sm font-semibold">{suggestion.name}</p>
                        <p className="text-xs text-neutral-500">
                          {suggestion.sharedEventTitle
                            ? `Shared: ${suggestion.sharedEventTitle}`
                            : "Suggested for you"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConnect(suggestion)}
                      className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                    >
                      Connect
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
