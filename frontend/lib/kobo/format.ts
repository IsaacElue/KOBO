export function formatAmount(value: number) {
  return value.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
