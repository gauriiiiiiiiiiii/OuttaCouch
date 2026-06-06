import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  headerAction?: ReactNode;
  children?: ReactNode;
};

export default function SectionCard({
  title,
  description,
  headerAction,
  children
}: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="text-sm text-neutral-600 leading-relaxed">{description}</p>
          ) : null}
        </div>
        {headerAction ? <div className="flex-shrink-0">{headerAction}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
