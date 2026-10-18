"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  method?: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "xs" | "lg";
  onDone?: (data: unknown) => void;
  successText?: string;
  pendingText?: string;
  className?: string;
};

/** Client button that calls one of our route handlers, toasts the result and refreshes the page. */
export function ActionButton({
  children,
  method = "POST",
  url,
  body,
  variant = "default",
  size = "sm",
  onDone,
  successText = "Done",
  pendingText,
  className,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const id = pendingText ? toast.loading(pendingText) : undefined;
      try {
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
        toast.success(successText, { id });
        onDone?.(data);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message, { id });
      }
    });
  }

  return (
    <Button variant={variant} size={size} onClick={run} disabled={pending} className={className}>
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}
