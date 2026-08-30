import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useRef } from 'react'
import { Tooltip } from 'radix-ui'
import { cn } from '#/lib/utils'
import type { AnimatedIcon, AnimatedIconHandle } from './icons'

const buttonVariants = cva(
  'relative inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-transparent px-[17px] text-[13px] font-[560] tracking-[-.01em] transition-[background,border-color,color,transform,box-shadow] duration-160 ease-out enabled:hover:-translate-y-px enabled:active:translate-y-px',
  {
    variants: {
      tone: {
        ink: cn(
          'bg-[linear-gradient(180deg,oklch(.335_.014_62),oklch(.185_.008_60))] text-paper',
          'shadow-[inset_0_1px_0_oklch(1_0_0/.2),inset_0_0_0_1px_oklch(0_0_0/.3),0_1px_1px_oklch(.2_.01_60/.22),0_4px_9px_oklch(.2_.01_60/.18),0_12px_24px_oklch(.28_.03_70/.16)] [text-shadow:0_1px_1px_oklch(0_0_0/.3)]',
          `after:pointer-events-none after:absolute after:inset-x-px after:top-px after:h-[45%] after:rounded-[999px_999px_40%_40%/999px_999px_100%_100%] after:bg-[linear-gradient(180deg,oklch(1_0_0/.13),transparent)] after:content-['']`,
          'enabled:hover:bg-[linear-gradient(180deg,oklch(.385_.016_62),oklch(.215_.009_60))] enabled:hover:shadow-[inset_0_1px_0_oklch(1_0_0/.26),inset_0_0_0_1px_oklch(0_0_0/.3),0_2px_2px_oklch(.2_.01_60/.2),0_7px_14px_oklch(.2_.01_60/.2),0_18px_34px_oklch(.28_.03_70/.2)]',
          'enabled:active:bg-[linear-gradient(180deg,oklch(.2_.008_60),oklch(.26_.011_60))] enabled:active:shadow-[inset_0_2px_4px_oklch(0_0_0/.42),inset_0_0_0_1px_oklch(0_0_0/.34),0_1px_1px_oklch(.2_.01_60/.18)] enabled:active:after:opacity-0',
        ),
        paper: cn(
          'border-line-strong bg-[linear-gradient(180deg,var(--color-paper),var(--color-surface))] text-ink-soft',
          'shadow-[inset_0_1px_0_oklch(1_0_0/.9),inset_0_-1px_0_oklch(.82_.006_75/.55),0_1px_1px_oklch(.2_.005_60/.1),0_4px_8px_oklch(.28_.02_70/.1)]',
          'enabled:hover:border-line-strong enabled:hover:bg-[linear-gradient(180deg,var(--color-paper),oklch(.97_.003_85))] enabled:hover:text-ink enabled:hover:shadow-[inset_0_1px_0_oklch(1_0_0/.95),inset_0_-1px_0_oklch(.82_.006_75/.48),0_2px_2px_oklch(.2_.005_60/.1),0_8px_15px_oklch(.28_.02_70/.14)]',
          'enabled:active:bg-[linear-gradient(180deg,var(--color-surface),var(--color-paper))] enabled:active:shadow-[inset_0_2px_3px_oklch(.2_.005_60/.14),inset_0_-1px_0_oklch(1_0_0/.75),0_1px_1px_oklch(.2_.005_60/.08)]',
        ),
        danger: cn(
          'bg-[linear-gradient(180deg,oklch(.59_.18_28),oklch(.49_.18_28))] text-paper',
          'shadow-[0_1px_1px_oklch(.2_.01_60/.18),0_5px_12px_oklch(.53_.19_28/.2)] [text-shadow:0_1px_1px_oklch(0_0_0/.2)]',
          'enabled:hover:bg-[linear-gradient(180deg,oklch(.64_.18_28),oklch(.53_.18_28))] enabled:hover:shadow-[0_2px_2px_oklch(.2_.01_60/.18),0_8px_16px_oklch(.53_.19_28/.24)]',
          'enabled:active:shadow-[inset_0_2px_4px_oklch(0_0_0/.24)]',
        ),
      },
      size: {
        default: '',
        compact: 'min-h-[34px] px-[14px] text-[11.5px]',
        mobileIcon: 'max-[600px]:size-[34px] max-[600px]:min-h-[34px] max-[600px]:gap-0 max-[600px]:p-0 max-[600px]:text-[0px]',
      },
    },
    defaultVariants: { tone: 'ink', size: 'default' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/** The shared embossed action primitive. Use `tone` for ink, paper, or danger. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, tone, size, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ tone, size }), className)} {...props} />
})

export function MimirMark({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  return (
    <div className={cn('inline-flex min-w-0 items-center gap-[9px]', large && 'gap-[11px]', compact && 'gap-0')} aria-label="mimir">
      <img
        className={cn(
          'block size-[30px] shrink-0 rounded-lg object-cover shadow-[inset_0_0_0_1px_oklch(.2_.005_60/.07)]',
          large && 'size-[38px] rounded-[10px] max-[600px]:size-8 max-[600px]:rounded-lg',
          compact && 'size-[26px] rounded-[7px]',
        )}
        src="/mimir-logo.png"
        alt=""
        width={large ? 38 : compact ? 26 : 30}
        height={large ? 38 : compact ? 26 : 30}
      />
      {!compact && <span className={cn('font-display text-xl font-[640] tracking-[-.03em]', large && 'text-[25px] max-[600px]:text-[21px]')}>mimir</span>}
    </div>
  )
}

export function AppBoot({ children, branded = false }: { children: ReactNode; branded?: boolean }) {
  return (
    <main className={cn(
      'grid min-h-dvh place-items-center gap-2.5 p-6 text-center text-base tracking-[-.012em] text-muted',
      '[&_a]:text-bark [&_strong]:font-display [&_strong]:text-[19px] [&_strong]:font-[620] [&_strong]:tracking-[-.025em] [&_strong]:text-ink',
      branded && 'content-center gap-[18px]',
    )}>
      {branded && <MimirMark large />}
      {children}
    </main>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: AnimatedIcon
  size?: number
  shortcut?: string
  active?: boolean
  danger?: boolean
}

/** Icon-only control with a consistent target, state treatment, and tooltip. */
export function IconButton({ label, icon: Icon, size = 17, shortcut, active, danger, className, ...props }: IconButtonProps) {
  const iconRef = useRef<AnimatedIconHandle>(null)

  return (
    <Tooltip.Root delayDuration={500}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          data-slot="icon-button"
          className={cn(
            'inline-grid size-[34px] shrink-0 place-items-center rounded-[9px] border-0 bg-transparent p-0 text-ink-soft transition-[background,color,transform] duration-150 ease-out enabled:hover:bg-sunken enabled:hover:text-ink enabled:active:scale-90',
            active && 'bg-ink text-paper shadow-[0_1px_2px_oklch(.2_.01_60/.3)] enabled:hover:bg-ink enabled:hover:text-paper',
            danger && 'text-danger enabled:hover:bg-[oklch(.96_.02_28)] enabled:hover:text-danger',
            className,
          )}
          aria-label={label}
          aria-pressed={active}
          onPointerEnter={() => iconRef.current?.startAnimation()}
          onPointerLeave={() => iconRef.current?.stopAnimation()}
          onFocus={() => iconRef.current?.startAnimation()}
          onBlur={() => iconRef.current?.stopAnimation()}
          {...props}
        >
          <Icon ref={iconRef} size={size} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="z-90 flex animate-tooltip-in items-center gap-[9px] rounded-[7px] bg-ink px-[9px] py-1.5 text-[11px] font-[520] text-paper shadow-menu" sideOffset={7}>
          {label}
          {shortcut && <kbd className="font-sans text-[10px] leading-none font-medium text-[oklch(.72_.006_60)]">{shortcut}</kbd>}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export const menuContentClass = 'z-40 min-w-44 animate-menu-in rounded-xl border border-line bg-paper p-[5px] shadow-menu'
export const menuItemClass = 'flex min-h-[34px] items-center gap-[9px] rounded-lg px-2.5 text-xs outline-none data-[highlighted]:bg-sunken'
export const dangerMenuItemClass = 'text-danger data-[highlighted]:bg-[oklch(.96_.02_28)]'
export const menuSeparatorClass = 'm-1 h-px bg-line'
export const dialogOverlayClass = 'fixed inset-0 z-60 animate-fade-in bg-[oklch(.2_.008_60/.34)] backdrop-blur-[2px]'
export const dialogSurfaceClass = 'fixed top-1/2 left-1/2 z-70 -translate-1/2 animate-dialog-in rounded-[20px] border border-line bg-paper shadow-[0_24px_80px_oklch(.15_.01_60/.26)]'

/** A document title prefers metadata and never exposes a raw `.pdf` suffix. */
export function documentLabel(record: { title?: string; name?: string }) {
  return record.title?.trim() || record.name?.replace(/\.pdf$/i, '').trim() || 'Untitled PDF'
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}
