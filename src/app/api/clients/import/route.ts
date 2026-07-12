import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { CLIENT_TYPES, CLIENT_STATUSES } from "@/lib/constants";

const MAX_FILE = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 1000;

// exceljs cell values can be rich objects (hyperlinked emails, formulas…).
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && v.text != null) return String(v.text).trim();
    if ("result" in v && v.result != null) return String(v.result).trim();
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("").trim();
    }
    return "";
  }
  return String(v).trim();
}

// Import clients from an .xlsx built on the template. Rows that fail
// validation or duplicate an existing client are skipped and reported.
export const POST = route(async (req) => {
  await requirePermission("manageClients");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Upload an .xlsx file in the 'file' field");
  if (file.size > MAX_FILE) return fail("The file must be under 2 MB");

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return fail("Could not read the file — is it a valid .xlsx workbook?");
  }
  const ws = wb.worksheets[0];
  if (!ws) return fail("The workbook has no worksheets");
  if (ws.rowCount > MAX_ROWS + 1) return fail(`Import at most ${MAX_ROWS} rows at a time`);

  // Map columns by header text (case-insensitive), so column order is free.
  const headerRow = ws.getRow(1);
  const cols = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    cols.set(cellText(cell.value).toLowerCase(), colNumber);
  });
  if (!cols.has("name")) {
    return fail('The first row must contain column headers, including "Name"');
  }
  const col = (row: ExcelJS.Row, header: string) => {
    const n = cols.get(header);
    return n ? cellText(row.getCell(n).value) : "";
  };

  // Existing clients, for duplicate detection by PAN or exact name.
  const existing = await prisma.client.findMany({ select: { name: true, pan: true } });
  const seenNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const seenPans = new Set(existing.map((c) => c.pan?.toUpperCase()).filter(Boolean));

  let created = 0;
  const skipped: { row: number; name: string; reason: string }[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = col(row, "name");
    const type = col(row, "type") || "Individual";
    const pan = col(row, "pan").toUpperCase();
    const status = col(row, "status") || "Active";

    // Entirely blank rows are ignored silently.
    if (!name && !pan && !col(row, "email") && !col(row, "phone")) continue;

    if (!name) {
      skipped.push({ row: r, name: "(blank)", reason: "Name is missing" });
      continue;
    }
    if (!(CLIENT_TYPES as readonly string[]).includes(type)) {
      skipped.push({ row: r, name, reason: `Unknown type "${type}"` });
      continue;
    }
    if (!(CLIENT_STATUSES as readonly string[]).includes(status)) {
      skipped.push({ row: r, name, reason: `Unknown status "${status}"` });
      continue;
    }
    if (pan && seenPans.has(pan)) {
      skipped.push({ row: r, name, reason: `A client with PAN ${pan} already exists` });
      continue;
    }
    if (seenNames.has(name.toLowerCase())) {
      skipped.push({ row: r, name, reason: "A client with this name already exists" });
      continue;
    }

    await prisma.client.create({
      data: {
        name,
        type,
        status,
        pan: pan || null,
        gstin: col(row, "gstin").toUpperCase() || null,
        tan: col(row, "tan").toUpperCase() || null,
        aadhaar: col(row, "aadhaar") || null,
        cin: col(row, "cin").toUpperCase() || null,
        llpin: col(row, "llp registration no.").toUpperCase() || null,
        firmRegNo: col(row, "firm registration no.") || null,
        email: col(row, "email") || null,
        phone: col(row, "phone") || null,
        contactPerson: col(row, "contact person") || null,
        address: col(row, "address") || null,
        notes: col(row, "notes") || null,
      },
    });
    created++;
    seenNames.add(name.toLowerCase());
    if (pan) seenPans.add(pan);
  }

  return ok({ created, skipped: skipped.slice(0, 50), skippedTotal: skipped.length });
});
