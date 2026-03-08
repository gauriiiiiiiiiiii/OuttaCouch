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
};

export default function ProfileHeader({
  name,
  bio,
  city,
  photo,
  stats,
  onSettingsClick
}: ProfileHeaderProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-200">
            {photo ? (
              <img src={photo} alt={name} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{name}</h2>
            {city ? <p className="text-sm text-neutral-600">{city}</p> : null}
            {bio ? <p className="text-sm text-neutral-600">{bio}</p> : null}
          </div>
        </div>
        {onSettingsClick ? (
          <button
            className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
            onClick={onSettingsClick}
          >
            Settings
          </button>
        ) : null}
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Attended
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {stats.eventsAttended}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Hosted
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {stats.eventsHosted}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Connections
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {stats.connections}
          </p>
        </div>
      </div>
    </div>
  );
}
