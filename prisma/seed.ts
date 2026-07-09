import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

// Helper: date offset by N days from now.
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
};

async function main() {
  console.log("Clearing existing data...");
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.complianceSchedule.deleteMany();
  await prisma.client.deleteMany();
  await prisma.staff.deleteMany();

  console.log("Seeding staff...");
  const [partner, manager, senior, article, accountant] = await Promise.all([
    prisma.staff.create({
      data: { name: "CA Rajesh Sharma", email: "rajesh@sharmaassociates.in", role: "Partner", phone: "+91 98200 11223", passwordHash: hashPassword("partner@123") },
    }),
    prisma.staff.create({
      data: { name: "CA Priya Nair", email: "priya@sharmaassociates.in", role: "Manager", phone: "+91 98200 44556", passwordHash: hashPassword("manager@123") },
    }),
    prisma.staff.create({
      data: { name: "Amit Deshpande", email: "amit@sharmaassociates.in", role: "Accountant", phone: "+91 99300 77889", passwordHash: hashPassword("staff@123") },
    }),
    prisma.staff.create({
      data: { name: "Sneha Iyer", email: "sneha@sharmaassociates.in", role: "Article Assistant", phone: "+91 90040 33221", passwordHash: hashPassword("staff@123") },
    }),
    prisma.staff.create({
      data: { name: "Vikram Rao", email: "vikram@sharmaassociates.in", role: "Accountant", phone: "+91 98860 55447", passwordHash: hashPassword("staff@123") },
    }),
  ]);

  console.log("Seeding clients...");
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: "Nimbus Technologies Pvt Ltd", type: "Private Limited", pan: "AABCN1234E", gstin: "27AABCN1234E1Z5",
        email: "accounts@nimbustech.in", phone: "+91 22 4123 5566", contactPerson: "Rohan Mehta",
        address: "Unit 402, Solaris Business Park, Andheri East, Mumbai 400069", status: "Active",
        notes: "Monthly retainer client. GST + TDS + Annual audit.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Greenleaf Organics LLP", type: "LLP", pan: "AAGFG5678K", gstin: "29AAGFG5678K1Z2",
        email: "finance@greenleaf.co.in", phone: "+91 80 2345 6677", contactPerson: "Ananya Krishnan",
        address: "14, MG Road, Bengaluru 560001", status: "Active",
        notes: "GST filings + LLP ROC compliance.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Sunrise Traders", type: "Proprietorship", pan: "BXYPS9012L", gstin: "24BXYPS9012L1Z9",
        email: "sunrise.traders@gmail.com", phone: "+91 79 2211 3344", contactPerson: "Suresh Patel",
        address: "Shop 8, Ashram Road, Ahmedabad 380009", status: "Active",
        notes: "Quarterly GST, composition scheme.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Dr. Meera Bhat", type: "Individual", pan: "AKLPB3456M",
        email: "meera.bhat@outlook.com", phone: "+91 98450 12345", contactPerson: "Dr. Meera Bhat",
        address: "22, Jayanagar 4th Block, Bengaluru 560011", status: "Active",
        notes: "Individual ITR + capital gains advisory.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Apex Constructions Pvt Ltd", type: "Private Limited", pan: "AADCA7788P", gstin: "27AADCA7788P1Z1",
        email: "cfo@apexconstructions.in", phone: "+91 22 6789 1122", contactPerson: "Nikhil Joshi",
        address: "7th Floor, Trade Centre, BKC, Mumbai 400051", status: "Active",
        notes: "Statutory audit + tax audit + monthly GST.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Vasudha Handlooms Partnership", type: "Partnership", pan: "AAEFV2233Q", gstin: "36AAEFV2233Q1Z4",
        email: "vasudha.handlooms@gmail.com", phone: "+91 40 2789 5566", contactPerson: "Lakshmi Reddy",
        address: "Plot 45, Jubilee Hills, Hyderabad 500033", status: "Active",
        notes: "Partnership firm, tax audit applicable.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Coastal Seafoods Exports", type: "Proprietorship", pan: "CQWPS4455R", gstin: "32CQWPS4455R1Z8",
        email: "exports@coastalseafoods.in", phone: "+91 484 233 4455", contactPerson: "Thomas Kurian",
        address: "Harbour Road, Kochi 682003", status: "Active",
        notes: "Export refunds under GST (LUT).",
      },
    }),
    prisma.client.create({
      data: {
        name: "Bright Future Charitable Trust", type: "Trust", pan: "AABTB6677S",
        email: "admin@brightfuturetrust.org", phone: "+91 141 220 8899", contactPerson: "Kavita Singh",
        address: "12, Civil Lines, Jaipur 302006", status: "Active",
        notes: "12A/80G compliance, Form 10B audit.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Zephyr Fashions Pvt Ltd", type: "Private Limited", pan: "AAJCZ8899T", gstin: "07AAJCZ8899T1Z3",
        email: "accounts@zephyrfashions.com", phone: "+91 11 4567 8899", contactPerson: "Rhea Kapoor",
        address: "B-24, Okhla Industrial Area, New Delhi 110020", status: "Inactive",
        notes: "Dormant since FY24-25. Pending closure.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Sanjay Malhotra (HUF)", type: "HUF", pan: "AADHS1122U",
        email: "sanjay.malhotra.huf@gmail.com", phone: "+91 98110 66778", contactPerson: "Sanjay Malhotra",
        address: "45, Sector 15, Gurugram 122001", status: "Active",
        notes: "HUF ITR + house property income.",
      },
    }),
  ]);

  const [nimbus, greenleaf, sunrise, meera, apex, vasudha, coastal, trust, zephyr, huf] = clients;

  console.log("Seeding tasks...");
  const taskData = [
    // Overdue / urgent
    { title: "GSTR-3B – June 2026", category: "GST", status: "In Progress", priority: "High", dueDate: daysFromNow(-2), clientId: nimbus.id, assigneeId: senior.id, description: "Monthly GST return for June 2026. Reconcile ITC before filing." },
    { title: "TDS Return 24Q – Q1 FY26-27", category: "TDS", status: "Pending", priority: "High", dueDate: daysFromNow(22), clientId: apex.id, assigneeId: accountant.id, description: "Quarterly TDS return on salaries." },
    { title: "GSTR-1 – June 2026", category: "GST", status: "Under Review", priority: "Medium", dueDate: daysFromNow(2), clientId: greenleaf.id, assigneeId: senior.id, description: "Outward supplies return." },
    { title: "Tax Audit u/s 44AB – FY 2025-26", category: "Audit", status: "Pending", priority: "High", dueDate: daysFromNow(75), clientId: vasudha.id, assigneeId: manager.id, description: "Turnover exceeds threshold. Form 3CD preparation." },
    { title: "Statutory Audit – FY 2025-26", category: "Audit", status: "In Progress", priority: "High", dueDate: daysFromNow(60), clientId: apex.id, assigneeId: partner.id, description: "Companies Act statutory audit. Fieldwork ongoing." },
    { title: "ITR Filing – AY 2026-27", category: "Income Tax", status: "Pending", priority: "Medium", dueDate: daysFromNow(21), clientId: meera.id, assigneeId: senior.id, description: "Individual return with capital gains from equity." },
    { title: "ITR & HUF Filing – AY 2026-27", category: "Income Tax", status: "Pending", priority: "Low", dueDate: daysFromNow(21), clientId: huf.id, assigneeId: accountant.id, description: "HUF return, house property income." },
    { title: "GST LUT Renewal – FY 2026-27", category: "GST", status: "Completed", priority: "Medium", dueDate: daysFromNow(-90), completedAt: daysFromNow(-88), clientId: coastal.id, assigneeId: senior.id, description: "Letter of Undertaking for export without payment of tax." },
    { title: "DIR-3 KYC – Directors", category: "ROC/MCA", status: "Pending", priority: "Medium", dueDate: daysFromNow(80), clientId: nimbus.id, assigneeId: manager.id, description: "Annual KYC of directors on MCA portal." },
    { title: "Form 11 – LLP Annual Return", category: "ROC/MCA", status: "Pending", priority: "Low", dueDate: daysFromNow(45), clientId: greenleaf.id, assigneeId: article.id, description: "LLP annual return filing." },
    { title: "Form 10B Audit – Trust", category: "Audit", status: "Pending", priority: "Medium", dueDate: daysFromNow(85), clientId: trust.id, assigneeId: manager.id, description: "Audit report for charitable trust u/s 12A." },
    { title: "GSTR-3B – Q1 (Composition)", category: "GST", status: "Completed", priority: "Low", dueDate: daysFromNow(-25), completedAt: daysFromNow(-26), clientId: sunrise.id, assigneeId: accountant.id, description: "CMP-08 quarterly statement." },
    { title: "Book-keeping – June 2026", category: "Accounting", status: "In Progress", priority: "Medium", dueDate: daysFromNow(5), clientId: nimbus.id, assigneeId: accountant.id, description: "Monthly accounting and bank reconciliation." },
    { title: "GST Registration Amendment", category: "Registration", status: "Under Review", priority: "Low", dueDate: daysFromNow(10), clientId: coastal.id, assigneeId: article.id, description: "Add additional place of business." },
    { title: "Advance Tax Computation – Q1", category: "Income Tax", status: "Completed", priority: "Medium", dueDate: daysFromNow(-24), completedAt: daysFromNow(-27), clientId: apex.id, assigneeId: manager.id, description: "First installment advance tax working." },
    { title: "GSTR-9 Annual Return – FY 2024-25", category: "GST", status: "Pending", priority: "Medium", dueDate: daysFromNow(170), clientId: greenleaf.id, assigneeId: senior.id, description: "Annual GST reconciliation return." },
  ];
  for (const t of taskData) {
    await prisma.task.create({ data: t });
  }

  console.log("Seeding invoices...");
  const invoiceData = [
    { invoiceNumber: "INV-2627-001", clientId: nimbus.id, description: "Retainership fee – Apr to Jun 2026", amount: 45000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-40), dueDate: daysFromNow(-25), paidDate: daysFromNow(-20) },
    { invoiceNumber: "INV-2627-002", clientId: apex.id, description: "Statutory audit fee – FY 2025-26 (advance)", amount: 125000, taxRate: 18, status: "Sent", issueDate: daysFromNow(-15), dueDate: daysFromNow(15) },
    { invoiceNumber: "INV-2627-003", clientId: greenleaf.id, description: "GST compliance – Q1 FY26-27", amount: 22000, taxRate: 18, status: "Overdue", issueDate: daysFromNow(-35), dueDate: daysFromNow(-5) },
    { invoiceNumber: "INV-2627-004", clientId: meera.id, description: "ITR filing & advisory – AY 2026-27", amount: 8000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-12), dueDate: daysFromNow(3), paidDate: daysFromNow(-8) },
    { invoiceNumber: "INV-2627-005", clientId: coastal.id, description: "GST export refund filing", amount: 18000, taxRate: 18, status: "Sent", issueDate: daysFromNow(-8), dueDate: daysFromNow(22) },
    { invoiceNumber: "INV-2627-006", clientId: vasudha.id, description: "Tax audit fee – FY 2025-26 (advance)", amount: 60000, taxRate: 18, status: "Draft", issueDate: daysFromNow(-2) },
    { invoiceNumber: "INV-2627-007", clientId: sunrise.id, description: "Quarterly GST + accounting", amount: 12000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-30), dueDate: daysFromNow(-15), paidDate: daysFromNow(-14) },
    { invoiceNumber: "INV-2627-008", clientId: trust.id, description: "12A/80G renewal & Form 10B", amount: 35000, taxRate: 18, status: "Overdue", issueDate: daysFromNow(-50), dueDate: daysFromNow(-20) },
  ];
  for (const inv of invoiceData) {
    await prisma.invoice.create({ data: inv });
  }

  console.log("Seeding documents...");
  const docData = [
    { name: "PAN Card", category: "PAN", clientId: nimbus.id, financialYear: "-", note: "Verified copy on file." },
    { name: "GST Registration Certificate", category: "GST", clientId: nimbus.id, financialYear: "-" },
    { name: "Audited Financials FY24-25", category: "Financial Statement", clientId: apex.id, financialYear: "2024-25" },
    { name: "ITR-V Acknowledgement AY25-26", category: "ITR", clientId: meera.id, financialYear: "2024-25" },
    { name: "Partnership Deed", category: "Agreement", clientId: vasudha.id, financialYear: "-" },
    { name: "12A Registration Order", category: "Other", clientId: trust.id, financialYear: "-" },
    { name: "Letter of Undertaking FY26-27", category: "GST", clientId: coastal.id, financialYear: "2026-27" },
    { name: "Bank Statements Q1", category: "Financial Statement", clientId: greenleaf.id, financialYear: "2026-27" },
  ];
  for (const d of docData) {
    await prisma.document.create({ data: d });
  }

  console.log("Seeding recurring compliance schedules...");
  const scheduleData = [
    { title: "GSTR-1", category: "GST", frequency: "Monthly", dueDay: 11, anchorMonth: 4, priority: "Medium", clientId: nimbus.id, assigneeId: senior.id },
    { title: "GSTR-3B", category: "GST", frequency: "Monthly", dueDay: 20, anchorMonth: 4, priority: "High", clientId: nimbus.id, assigneeId: senior.id },
    { title: "TDS Payment", category: "TDS", frequency: "Monthly", dueDay: 7, anchorMonth: 4, priority: "Medium", clientId: nimbus.id, assigneeId: accountant.id },
    { title: "GSTR-3B", category: "GST", frequency: "Monthly", dueDay: 20, anchorMonth: 4, priority: "High", clientId: greenleaf.id, assigneeId: senior.id },
    { title: "GSTR-3B", category: "GST", frequency: "Monthly", dueDay: 20, anchorMonth: 4, priority: "High", clientId: apex.id, assigneeId: accountant.id },
    { title: "Advance Tax", category: "Income Tax", frequency: "Quarterly", dueDay: 15, anchorMonth: 6, priority: "Medium", clientId: apex.id, assigneeId: manager.id },
    { title: "CMP-08", category: "GST", frequency: "Quarterly", dueDay: 18, anchorMonth: 7, priority: "Low", clientId: sunrise.id, assigneeId: accountant.id },
    { title: "Tax Audit u/s 44AB", category: "Audit", frequency: "Annually", dueDay: 30, anchorMonth: 9, priority: "High", clientId: vasudha.id, assigneeId: manager.id },
    { title: "GSTR-1", category: "GST", frequency: "Monthly", dueDay: 11, anchorMonth: 4, priority: "Medium", clientId: coastal.id, assigneeId: article.id },
  ];
  for (const s of scheduleData) {
    await prisma.complianceSchedule.create({ data: s });
  }

  const counts = {
    staff: await prisma.staff.count(),
    clients: await prisma.client.count(),
    tasks: await prisma.task.count(),
    invoices: await prisma.invoice.count(),
    documents: await prisma.document.count(),
    schedules: await prisma.complianceSchedule.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
