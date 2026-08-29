import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface LockIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LockIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const LockIcon = forwardRef<LockIconHandle, LockIconProps>(
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
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          initial="normal"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          transition={{
            duration: 1,
            ease: [0.4, 0, 0.2, 1],
          }}
          variants={{
            normal: {
              rotate: 0,
              scale: 1,
            },
            animate: {
              rotate: [-3, 1, -2, 0],
              scale: [0.95, 1.05, 0.98, 1],
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
          <motion.path
            animate={controls}
            d="M7 11V7a5 5 0 0 1 10 0v4"
            initial="normal"
            transition={{
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
            }}
            variants={{
              normal: {
                pathLength: 1,
              },
              animate: {
                pathLength: 0.7,
              },
            }}
          />
        </motion.svg>
      </span>
    );
  }
);

LockIcon.displayName = "LockIcon";

export { LockIcon };
