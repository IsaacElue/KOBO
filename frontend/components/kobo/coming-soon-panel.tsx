"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Hammer } from "lucide-react";

export function ComingSoonPanel({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <Card className="max-w-md items-center gap-3 rounded-[28px] border border-white/90 bg-white/85 p-10 text-center ring-0">
        <div className="flex size-14 items-center justify-center rounded-full bg-[#F1F6F7]">
          <Hammer className="size-6 text-kobo-teal-600" strokeWidth={1.7} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-kobo-ink">
          {label} isn&apos;t built yet
        </h2>
        <p className="text-[14.5px] text-[#7B959B]">
          We&apos;re still working on this part of Kobo. Sending money is ready to go.
        </p>
        <Button
          onClick={onBack}
          className="mt-2 h-auto rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-6 py-2.5 text-kobo-mint-light hover:opacity-95"
        >
          Back to Send money
        </Button>
      </Card>
    </div>
  );
}
