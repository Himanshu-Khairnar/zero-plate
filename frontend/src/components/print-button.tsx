"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button className="no-print" onClick={() => window.print()}>
      <Printer data-icon="inline-start" /> Print
    </Button>
  );
}
