import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Pill buttons: primary (ink fill, white text), secondary (outline), ghost (text). */
export const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,border-color,opacity,transform,box-shadow] duration-150 ease-[var(--ease)] select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-white shadow-[0_8px_24px_-8px_rgb(12_10_29/0.6)] ring-1 ring-white/20 hover:bg-[#241b47]",
        secondary: "border border-ink/25 bg-white/50 text-ink hover:bg-white/80",
        ghost: "bg-transparent text-ink underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-12 min-w-11 px-6 text-base",
        sm: "h-9 min-w-9 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Keeps the button's width and swaps the label for a spinner. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="animate-spin-slow size-4 rounded-full border-2 border-current border-r-transparent" />
        </span>
      ) : null}
    </button>
  );
}
