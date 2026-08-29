import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface ArrowUpRightIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ArrowUpRightIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const ARROW_VARIANTS: Variants = {
  normal: {
    scale: 1,
    translateX: 0,
    translateY: 0,
  },
  animate: {
    scale: [1, 0.85, 1],
    translateX: [0, -4, 0],
    translateY: [0, 4, 0],
    originX: 1,
    originY: 0,
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
};

const ArrowUpRightIcon = forwardRef<
  ArrowUpRightIconHandle,
  ArrowUpRightIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 18, strokeWidth = 1.75, ...props }, ref) => {
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
        <motion.g animate={controls} variants={ARROW_VARIANTS}>
          <path d="M7 7H17" />
          <path d="M17 7V17" />
          <path d="M7 17L17 7" />
        </motion.g>
      </svg>
    </span>
  );
});

ArrowUpRightIcon.displayName = "ArrowUpRightIcon";

export { ArrowUpRightIcon };
