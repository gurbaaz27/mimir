import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, } from "react";

export interface PlusIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PlusIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const PlusIcon = forwardRef<PlusIconHandle, PlusIconProps>(
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
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          variants={{
            normal: {
              rotate: 0,
            },
            animate: {
              rotate: 180,
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </motion.svg>
      </span>
    );
  }
);

PlusIcon.displayName = "PlusIcon";

export { PlusIcon };
