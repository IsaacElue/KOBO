import { Suspense } from "react";
import { KoboApp } from "@/components/kobo/kobo-app";

export default function Home() {
  return (
    <Suspense>
      <KoboApp />
    </Suspense>
  );
}
