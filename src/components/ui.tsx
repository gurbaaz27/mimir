import type { ButtonHTMLAttributes } from 'react'
import { useRef } from 'react'
import { Tooltip } from 'radix-ui'
import type { AnimatedIcon, AnimatedIconHandle } from './icons'

export function MimirMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="mimir">
      <img className="brand-mark" src="/mimir-logo.png" alt="" width={30} height={30} />
      {!compact && <span className="brand-name">mimir</span>}
    </div>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: AnimatedIcon
  size?: number
  shortcut?: string
  active?: boolean
}

/**
 * The button owns the icon's hover animation, so the motion fires anywhere on
 * the target rather than only over the glyph itself.
 */
export function IconButton({ label, icon: Icon, size = 17, shortcut, active, className = '', ...props }: IconButtonProps) {
  const iconRef = useRef<AnimatedIconHandle>(null)

  return (
    <Tooltip.Root delayDuration={500}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`icon-button ${active ? 'is-active' : ''} ${className}`}
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
        <Tooltip.Content className="tooltip" sideOffset={7}>
          {label}
          {shortcut && <kbd>{shortcut}</kbd>}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
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
