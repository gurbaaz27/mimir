import { cn } from "#/lib/utils"

/**
 * shadcn/ui `kbd`, themed to mimir: a hairline key cap sized for the product's
 * 11–12px type scale rather than shadcn's 14px default. Inside a tooltip the
 * cap inverts, because that surface is ink rather than paper.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-[18px] w-fit min-w-[18px] items-center justify-center gap-1 rounded-[5px] bg-sunken px-[5px] align-[-3px] font-sans text-[10.5px] leading-none font-[540] text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)] select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        "[[data-slot=tooltip-content]_&]:bg-[oklch(1_0_0/.13)] [[data-slot=tooltip-content]_&]:text-[oklch(.78_.006_60)] [[data-slot=tooltip-content]_&]:shadow-none",
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
