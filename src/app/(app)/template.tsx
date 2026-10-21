"use client";

import { motion } from "motion/react";

/**
 * Every page in the workspace arrives the same way: a short fade and lift.
 * A template remounts on each navigation, so the entrance plays per page;
 * MotionProvider in the root layout turns it off under "Reduce motion".
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
