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
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10">
      <header className="space-y-2">
        {backHref ? (
          <a
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600"
          >
            {backLabel}
          </a>
        ) : null}
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle ? <p className="text-neutral-700">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
