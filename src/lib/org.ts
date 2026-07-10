import "server-only";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FIRM } from "@/lib/firm";

/** Letterhead data consumed by the PDF builders and the app shell. */
export type Letterhead = {
  name: string;
  tagline: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  pan: string | null;
  gstin: string | null;
  sacCode: string;
  stateCode: string | null; // GSTIN state prefix, drives CGST/SGST vs IGST
  bank: { name: string | null; account: string | null; ifsc: string | null; upi: string | null };
  invoiceNote: string | null;
  logo: Uint8Array | null;
  logoMime: string | null;
};

/** Map an Organization row (or null) to letterhead data, falling back to the
 *  built-in FIRM constants so PDFs always render something sensible. */
export function toLetterhead(org: Organization | null): Letterhead {
  if (!org) {
    return {
      name: FIRM.name,
      tagline: FIRM.tagline,
      addressLines: [...FIRM.addressLines],
      phone: FIRM.phone,
      email: FIRM.email,
      pan: FIRM.pan,
      gstin: FIRM.gstin,
      sacCode: FIRM.sacCode,
      stateCode: FIRM.gstin.slice(0, 2),
      bank: {
        name: FIRM.bank.name,
        account: FIRM.bank.account,
        ifsc: FIRM.bank.ifsc,
        upi: FIRM.bank.upi,
      },
      invoiceNote: FIRM.invoiceNote,
      logo: null,
      logoMime: null,
    };
  }
  return {
    name: org.name,
    tagline: org.tagline,
    addressLines: (org.address ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
    phone: org.phone,
    email: org.email,
    pan: org.pan,
    gstin: org.gstin,
    sacCode: org.sacCode,
    stateCode: org.gstin ? org.gstin.slice(0, 2) : null,
    bank: {
      name: org.bankName,
      account: org.bankAccount,
      ifsc: org.bankIfsc,
      upi: org.bankUpi,
    },
    invoiceNote: org.invoiceNote,
    logo: org.logo ?? null,
    logoMime: org.logoMime,
  };
}

/** The firm's default organization, or null when none is configured yet. */
export async function getDefaultOrg(): Promise<Organization | null> {
  return (
    (await prisma.organization.findFirst({ where: { isDefault: true } })) ??
    (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } }))
  );
}
