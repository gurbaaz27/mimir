import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface PanelLeftOpenIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PanelLeftOpenIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const DEFAULT_TRANSITION: Transition = {
  times: [0, 0.4, 1],
  duration: 0.5,
};

const PATH_VARIANTS: Variants = {
  normal: { x: 0 },
  animate: { x: [0, 1.5, 0] },
};

const PanelLeftOpenIcon = forwardRef<
  PanelLeftOpenIconHandle,
  PanelLeftOpenIconProps
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
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <path d="M9 3v18" />
        <motion.path
          animate={controls}
          d="m14 9 3 3-3 3"
          transition={DEFAULT_TRANSITION}
          variants={PATH_VARIANTS}
        />
      </svg>
    </span>
  );
});

PanelLeftOpenIcon.displayName = "PanelLeftOpenIcon";

export { PanelLeftOpenIcon };
