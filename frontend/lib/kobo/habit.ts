import { TRANSFER_HISTORY } from "./mock-data";

/**
 * Data for the "Kobo Habit Tracker" card in the success modal (design handoff,
 * step 6). There is no backend for streaks / delivery-speed / monthly-volume
 * yet, so this is illustrative: the transfer count is real (delivered rows in
 * history + this send), the prior-month volumes are fixed sample figures, and
 * only the current month's bar reflects the amount just sent. Swap in real
 * aggregates here once an endpoint exists.
 */

export interface HabitSummary {
  /** e.g. "3rd" — nth delivered transfer this quarter, ordinal-suffixed. */
  transferOrdinal: string;
  avgDeliveryStr: string;
  /** 4-segment strip: how many of a quarterly goal of 4 are filled. */
  segmentsFilled: number;
  segmentsTotal: number;
  monthlyTarget: number;
  currencySymbol: string;
  bars: { month: string; value: number; current: boolean }[];
}

const MONTHLY_TARGET_EUR = 300;
const AVG_DELIVERY = "1m 48s";
/** Fixed sample volumes for the three months before the current one. */
const SAMPLE_PRIOR_VOLUMES = [200, 310, 195];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function buildHabitSummary(
  currentMonthVolume: number,
  currencySymbol: string,
  now: Date = new Date()
): HabitSummary {
  const deliveredSoFar = TRANSFER_HISTORY.filter((t) => t.status === "Delivered").length;
  const count = deliveredSoFar + 1;

  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
    return d.toLocaleDateString("en-IE", { month: "short" });
  });

  const bars = months.map((month, i) => ({
    month,
    value: i < 3 ? SAMPLE_PRIOR_VOLUMES[i] : Math.max(0, Math.round(currentMonthVolume)),
    current: i === 3,
  }));

  return {
    transferOrdinal: ordinal(count),
    avgDeliveryStr: AVG_DELIVERY,
    segmentsFilled: Math.min(count, 4),
    segmentsTotal: 4,
    monthlyTarget: MONTHLY_TARGET_EUR,
    currencySymbol,
    bars,
  };
}
