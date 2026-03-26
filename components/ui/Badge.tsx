type BadgeProps = {
  label: string;
};

export default function Badge({ label }: BadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-subtle px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-all hover:bg-white hover:border-neutral-300">
      {label}
    </span>
  );
}
