import { Suspense } from "react";
import { AuthGate } from "@/components/kobo/auth-gate";

export default function Home() {
  return (
    <Suspense>
      <AuthGate />
    </Suspense>
  );
}
