import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getCurrencySymbol(currency: 'EUR' | 'USD' | 'GBP'): string {
  const symbols = {
    EUR: '€',
    USD: '$',
    GBP: '£'
  };
  return symbols[currency];
}
