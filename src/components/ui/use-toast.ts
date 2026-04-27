import * as React from "react";
import type { ToastProps } from "./toast";

export type ToasterToast = Omit<ToastProps, "title" | "description"> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

type State = { toasts: ToasterToast[] };

const listeners = new Set<(state: State) => void>();
let memoryState: State = { toasts: [] };

function dispatch(updater: (s: State) => State) {
  memoryState = updater(memoryState);
  listeners.forEach((l) => l(memoryState));
}

let count = 0;
const TOAST_TIMEOUT = 4000;

export function toast({
  title,
  description,
  variant,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  const id = String(++count);
  dispatch((s) => ({ toasts: [...s.toasts, { id, title, description, variant, open: true }] }));
  setTimeout(() => {
    dispatch((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, TOAST_TIMEOUT);
  return id;
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return { ...state, toast };
}
