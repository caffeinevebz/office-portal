// Convert an amount to words using the Indian numbering system
// (crore / lakh / thousand), e.g. 147500 -> "One Lakh Forty Seven Thousand
// Five Hundred". Used on invoices and receipts.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Whole number to Indian-system words. 0 -> "Zero". Supports up to 99 crore crore. */
export function numberToWordsIndian(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";

  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  if (crore) {
    parts.push(
      (crore > 99 ? numberToWordsIndian(crore) : twoDigits(crore)) + " Crore",
    );
  }
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** Amount in rupees to words, e.g. "Rupees One Lakh Five Hundred Only". */
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return words + " Only";
}
