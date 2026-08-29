import { motion, useAnimation, type Variants } from 'motion/react'
import type { ForwardRefExoticComponent, HTMLAttributes, MouseEvent, RefAttributes } from 'react'
import { forwardRef, useCallback, useImperativeHandle } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface AnimatedIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number
  strokeWidth?: number
}

export type AnimatedIcon = ForwardRefExoticComponent<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>

/**
 * Wraps a static Lucide glyph in the same hover contract the lucide-animated
 * icons use, so every icon in the product can be driven from its container.
 */
export function createHoverIcon(displayName: string, Glyph: LucideIcon, variants: Variants) {
  const Icon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ onMouseEnter, onMouseLeave, className, size = 18, strokeWidth = 1.75, ...props }, ref) => {
      const controls = useAnimation()

      useImperativeHandle(ref, () => ({
        startAnimation: () => void controls.start('animate'),
        stopAnimation: () => void controls.start('normal'),
      }))

      const handleMouseEnter = useCallback(
        (event: MouseEvent<HTMLSpanElement>) => {
          onMouseEnter?.(event)
          void controls.start('animate')
        },
        [controls, onMouseEnter],
      )

      const handleMouseLeave = useCallback(
        (event: MouseEvent<HTMLSpanElement>) => {
          onMouseLeave?.(event)
          void controls.start('normal')
        },
        [controls, onMouseLeave],
      )

      return (
        <span
          className={`icon-glyph ${className ?? ''}`}
          aria-hidden="true"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          {...props}
        >
          <motion.span animate={controls} initial="normal" variants={variants}>
            <Glyph size={size} strokeWidth={strokeWidth} />
          </motion.span>
        </span>
      )
    },
  )
  Icon.displayName = displayName
  return Icon
}

const EASE = { duration: 0.45, ease: 'easeInOut' } as const

export const nudge = (x: number, y: number): Variants => ({
  normal: { x: 0, y: 0 },
  animate: { x: [0, x, 0], y: [0, y, 0], transition: EASE },
})

export const wobble = (degrees: number): Variants => ({
  normal: { rotate: 0 },
  animate: { rotate: [0, -degrees, degrees * 0.6, 0], transition: EASE },
})

export const pulse: Variants = {
  normal: { scale: 1 },
  animate: { scale: [1, 0.82, 1.06, 1], transition: EASE },
}

export const squash: Variants = {
  normal: { scaleX: 1 },
  animate: { scaleX: [1, 0.65, 1], transition: EASE },
}
