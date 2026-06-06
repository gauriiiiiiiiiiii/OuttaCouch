import Link from "next/link";
import NotificationBell from "@/components/ui/NotificationBell";
import ChatBadge from "@/components/ui/ChatBadge";

const plainNavItems = [
  { href: "/explore", label: "Explore" },
  { href: "/events/new", label: "Add Event" },
  { href: "/connections", label: "Connections" },
  { href: "/profile", label: "Profile" }
];

export default function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white/80 px-4 py-8 md:flex md:flex-col">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-ocean">
            OUTTACOUCH
          </span>
          <NotificationBell />
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {plainNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-parchment"
            >
              {item.label}
            </Link>
          ))}
          <div className="rounded-lg px-3 py-2 text-sm hover:bg-parchment">
            <ChatBadge />
          </div>
        </nav>
      </aside>
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white/95 px-4 py-3 text-xs md:hidden">
        <div className="flex items-center justify-around">
          {plainNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="font-semibold">
              {item.label}
            </Link>
          ))}
          <ChatBadge />
          <NotificationBell />
        </div>
      </nav>
    </div>
  );
}
