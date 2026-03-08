type BadgeProps = {
  label: string;
};

export default function Badge({ label }: BadgeProps) {
  return (
    <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold">
      {label}
    </span>
  );
}
