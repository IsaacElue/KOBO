export function formatAmount(value: number) {
  return value.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** First letter of up to the first two words, uppercased. Same convention `handleAddRecipient` (kobo-app.tsx) already used inline for a new recipient's avatar initials. */
export function nameToInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
