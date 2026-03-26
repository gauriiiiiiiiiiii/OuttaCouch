type PageShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
};

export default function PageShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  children
}: PageShellProps) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 md:gap-10 md:py-16 animate-fade-in">
      <header className="space-y-3">
        {backHref ? (
          <a
            href={backHref}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean transition-colors hover:text-ocean/80"
          >
            <span className="opacity-50">→</span> {backLabel}
          </a>
        ) : null}
        <h1 className="text-4xl font-semibold text-ink md:text-5xl">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-base text-neutral-600 leading-relaxed">{subtitle}</p> : null}
      </header>
      <div className="min-h-[200px]">{children}</div>
    </section>
  );
}
