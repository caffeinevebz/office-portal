// Firm identity used on generated documents (invoices, receipts).
// Edit this file to change the letterhead in one place.

export const FIRM = {
  name: "Sharma & Associates",
  tagline: "Chartered Accountants",
  addressLines: [
    "302, Meridian Business Centre, S.V. Road",
    "Andheri West, Mumbai 400058, Maharashtra",
  ],
  phone: "+91 22 2671 4455",
  email: "office@sharmaassociates.in",
  pan: "AAKFS3121L",
  gstin: "27AAKFS3121L1Z6", // state code 27 = Maharashtra
  sacCode: "9982", // accounting, auditing & tax consultancy services
  bank: {
    name: "HDFC Bank, Andheri West Branch",
    account: "50200011223344",
    ifsc: "HDFC0000239",
    upi: "sharmaassociates@hdfcbank",
  },
  invoiceNote:
    "Payment is due within 15 days of the invoice date. Kindly quote the invoice number when remitting.",
} as const;

/** GSTIN state code of the firm ("27" for Maharashtra). */
export const FIRM_STATE_CODE = FIRM.gstin.slice(0, 2);
