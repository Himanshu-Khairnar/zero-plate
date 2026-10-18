"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AlertBell({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href="/alerts" aria-label={`${count} unread alerts`} />} />}
      >
        <span className="relative inline-flex">
          <Bell />
          {count > 0 ? (
            <Badge className="absolute -top-2.5 -right-2.5 h-4 min-w-4 px-1 text-[10px] tabular-nums">{count > 99 ? "99+" : count}</Badge>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{count > 0 ? `${count} unread alert${count === 1 ? "" : "s"}` : "No unread alerts"}</TooltipContent>
    </Tooltip>
  );
}
