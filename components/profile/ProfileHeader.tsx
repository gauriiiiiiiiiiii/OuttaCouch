import Image from "next/image";

type ProfileHeaderProps = {
  name: string;
  bio?: string | null;
  city?: string | null;
  photo?: string | null;
  stats: {
    eventsAttended: number;
    eventsHosted: number;
    connections: number;
  };
  onSettingsClick?: () => void;
  onAttendedClick?: () => void;
  onHostedClick?: () => void;
  onConnectionsClick?: () => void;
};

export default function ProfileHeader({
  name,
  bio,
  city,
  photo,
  stats,
  onSettingsClick,
  onAttendedClick,
  onHostedClick,
  onConnectionsClick
}: ProfileHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white/60 to-transparent" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/70 bg-neutral-200 shadow-sm">
            {photo ? (
              <Image src={photo} alt={name} fill sizes="80px" className="object-cover" />
            ) : null}
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-ink">{name}</h2>
            {city ? <p className="text-sm text-neutral-600">{city}</p> : null}
            {bio ? <p className="text-sm text-neutral-600">{bio}</p> : null}
          </div>
        </div>
        {onSettingsClick ? (
          <button
            className="rounded-full border border-neutral-300 bg-white/80 px-4 py-2 text-xs font-semibold transition hover:border-neutral-400 hover:shadow-sm"
            onClick={onSettingsClick}
          >
            Settings
          </button>
        ) : null}
      </div>
      <div className="relative mt-6 grid gap-3 md:grid-cols-3">
        {[
          { label: "Attended", value: stats.eventsAttended, onClick: onAttendedClick },
          { label: "Hosted", value: stats.eventsHosted, onClick: onHostedClick },
          { label: "Connections", value: stats.connections, onClick: onConnectionsClick }
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="text-left rounded-2xl border border-neutral-200/80 bg-white/95 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">{item.value}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
