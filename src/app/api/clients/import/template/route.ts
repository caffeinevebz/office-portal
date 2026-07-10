import ExcelJS from "exceljs";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

// Downloadable .xlsx template for the client import.
export const GET = route(async () => {
  await requireUser();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clients");

  ws.columns = [
    { header: "Name", key: "name", width: 34 },
    { header: "Type", key: "type", width: 18 },
    { header: "PAN", key: "pan", width: 14 },
    { header: "GSTIN", key: "gstin", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Contact Person", key: "contactPerson", width: 22 },
    { header: "Address", key: "address", width: 44 },
    { header: "Status", key: "status", width: 10 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };

  ws.addRow({
    name: "Example Traders Pvt Ltd",
    type: "Private Limited",
    pan: "AAAPE1234F",
    gstin: "27AAAPE1234F1Z5",
    email: "accounts@example.in",
    phone: "+91 98765 43210",
    contactPerson: "Anil Kumar",
    address: "12, Example Street, Mumbai 400001",
    status: "Active",
    notes: "Monthly GST retainer",
  });
  ws.addRow({
    name: "Sunita Verma",
    type: "Individual",
    pan: "ABCPV5678K",
    status: "Active",
    notes: "ITR only",
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(Buffer.from(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="clients-import-template.xlsx"',
    },
  });
});
