import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface BotIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BotIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const BotIcon = forwardRef<BotIconHandle, BotIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 18, strokeWidth = 1.75, ...props }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    }));

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        onMouseEnter?.(e);
        controls.start("animate");
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        onMouseLeave?.(e);
        controls.start("normal");
      },
      [controls, onMouseLeave]
    );

    return (
      <span
        className={`icon-glyph ${className ?? ""}`}
        aria-hidden="true"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 8V4H8" />
          <rect height="12" rx="2" width="16" x="4" y="8" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />

          <motion.line
            animate={controls}
            initial="normal"
            variants={{
              normal: { y1: 13, y2: 15 },
              animate: {
                y1: [13, 14, 13],
                y2: [15, 14, 15],
                transition: {
                  duration: 0.5,
                  ease: "easeInOut",
                  delay: 0.2,
                },
              },
            }}
            x1={15}
            x2={15}
          />

          <motion.line
            animate={controls}
            initial="normal"
            variants={{
              normal: { y1: 13, y2: 15 },
              animate: {
                y1: [13, 14, 13],
                y2: [15, 14, 15],
                transition: {
                  duration: 0.5,
                  ease: "easeInOut",
                  delay: 0.2,
                },
              },
            }}
            x1={9}
            x2={9}
          />
        </svg>
      </span>
    );
  }
);

BotIcon.displayName = "Bot";

export { BotIcon };
