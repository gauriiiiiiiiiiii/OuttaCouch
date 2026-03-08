type SectionCardProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export default function SectionCard({
  title,
  description,
  children
}: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-neutral-600">{description}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
