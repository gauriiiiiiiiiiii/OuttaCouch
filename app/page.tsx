export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-start justify-center gap-6 px-6 py-20">
      <p className="text-sm uppercase tracking-[0.3em] text-ocean">OUTTACOUCH</p>
      <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
        Get off the couch. Meet people through real experiences.
      </h1>
      <p className="max-w-2xl text-lg text-neutral-700">
        Event-first social connection. No followers, no vanity, just real-world
        moments.
      </p>
      <div className="flex gap-3">
        <a
          className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-parchment"
          href="/login"
        >
          Log In
        </a>
        <a
          className="rounded-full border border-ink px-6 py-3 text-sm font-semibold"
          href="/signup"
        >
          Get Started
        </a>
      </div>
    </main>
  );
}
