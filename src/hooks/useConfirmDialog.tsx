import { useState, useCallback, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { description: "" },
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === "string" ? { description: options } : options;
    return new Promise((resolve) => {
      setState({ open: true, options: opts, resolve });
    });
  }, []);

  const handleResponse = useCallback((value: boolean) => {
    state.resolve?.(value);
    setState((prev) => ({ ...prev, open: false, resolve: null }));
  }, [state.resolve]);

  const ConfirmDialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && handleResponse(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.options.title || "Confirmação"}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {state.options.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleResponse(false)}>
            {state.options.cancelLabel || "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleResponse(true)}
            className={state.options.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {state.options.confirmLabel || "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
