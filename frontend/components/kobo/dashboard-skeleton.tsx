import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="grid flex-1 grid-cols-1 items-start gap-6.5 p-8 sm:p-10 xl:grid-cols-[minmax(440px,1.35fr)_minmax(360px,0.9fr)]">
      <div className="flex flex-col gap-5.5">
        <Skeleton className="h-8 w-[38%] rounded-lg" />
        <div className="flex flex-col gap-5.5 rounded-[28px] bg-white p-8">
          <Skeleton className="h-3 w-[22%]" />
          <Skeleton className="h-13 w-[44%] rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="h-10.5 w-24 rounded-full" />
            <Skeleton className="h-10.5 w-24 rounded-full" />
            <Skeleton className="h-10.5 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-37.5 rounded-[28px]" />
      </div>
      <Skeleton className="h-[430px] rounded-[28px]" />
    </div>
  );
}
