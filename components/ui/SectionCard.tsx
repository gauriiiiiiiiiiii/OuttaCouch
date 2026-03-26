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
    <div className="rounded-2xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300 p-6 md:p-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="text-sm text-neutral-600 leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
