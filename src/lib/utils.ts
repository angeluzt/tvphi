import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Une clases de Tailwind resolviendo conflictos.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatea centavos a moneda legible.
export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// Formatea números grandes (puntos, viewers) de forma compacta.
export function formatCompact(n: number | bigint) {
  return new Intl.NumberFormat("es", { notation: "compact" }).format(
    typeof n === "bigint" ? Number(n) : n,
  );
}

// Normaliza un slug de canal.
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

// Serializa objetos con BigInt (Prisma) a JSON.
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}
