/**
 * Toast — reusable slide-up notification with optional action button.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string;
  action?: ToastAction;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({ message, action, duration = 5000, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <motion.div
      className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-dreamloom-surface/95 px-5 py-3 shadow-2xl backdrop-blur-xl">
        <span className="font-body text-sm text-dreamloom-text">{message}</span>
        {action && (
          <button
            onClick={action.onClick}
            className="rounded-lg border border-dreamloom-gold/30 bg-dreamloom-gold/10 px-3 py-1 font-body text-sm font-medium text-dreamloom-gold transition-colors hover:bg-dreamloom-gold/20"
          >
            {action.label}
          </button>
        )}
        <button
          onClick={onDismiss}
          className="ml-1 text-dreamloom-muted transition-colors hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
