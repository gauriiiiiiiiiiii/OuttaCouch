import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "subtle";
type ButtonSize = "sm" | "md" | "lg" | "xl";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  children?: React.ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-parchment hover:bg-ink/90 active:bg-ink/95 shadow-sm hover:shadow-md",
  secondary:
    "bg-ocean text-white hover:bg-ocean/90 active:bg-ocean/95 shadow-sm hover:shadow-md",
  outline:
    "border border-border bg-white text-ink hover:bg-subtle active:bg-neutral-100",
  ghost: "text-ink hover:bg-subtle active:bg-neutral-100",
  subtle:
    "bg-subtle text-ink hover:bg-neutral-200 active:bg-neutral-300"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-semibold rounded-md gap-1.5",
  md: "px-4 py-2.5 text-sm font-semibold rounded-lg gap-2",
  lg: "px-5 py-3 text-base font-semibold rounded-lg gap-2",
  xl: "px-6 py-3.5 text-base font-semibold rounded-xl gap-2.5"
};

export default function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center
        transition-all duration-200 ease-smooth
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className || ""}
      `}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}