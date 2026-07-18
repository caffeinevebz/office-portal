import { redirect } from "next/navigation";

// The receipt register now lives inside the Invoices module (one billing
// module, less clutter); keep old links and bookmarks working.
export default function ReceiptsRedirect() {
  redirect("/invoices?tab=receipts");
}
