import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface UnderlineIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface UnderlineIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
  },
};

const UnderlineIcon = forwardRef<UnderlineIconHandle, UnderlineIconProps>(
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
          <motion.path
            animate={controls}
            d="M6 4v6a6 6 0 0 0 12 0V4"
            transition={{ duration: 0.3 }}
            variants={VARIANTS}
          />
          <motion.line
            animate={controls}
            transition={{
              delay: 0.2,
              duration: 0.4,
            }}
            variants={VARIANTS}
            x1="4"
            x2="20"
            y1="20"
            y2="20"
          />
        </svg>
      </span>
    );
  }
);

UnderlineIcon.displayName = "UnderlineIcon";

export { UnderlineIcon };
