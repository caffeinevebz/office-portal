// Demo dataset loader, shared by `npm run db:seed` and the first-run
// setup endpoint. Clears all data, then loads the sample firm.
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "./auth/password";
import { ensureSystemRoles } from "./auth/ensure-roles";
import { financialYears } from "./constants";

// Helper: date offset by N days from now.
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
};

export async function seedDemoData(prisma: PrismaClient) {
  console.log("Clearing existing data...");
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.complianceSchedule.deleteMany();
  await prisma.dscMovement.deleteMany();
  await prisma.dsc.deleteMany();
  await prisma.packetMovement.deleteMany();
  await prisma.docPacket.deleteMany();
  await prisma.itrFiling.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.tradeName.deleteMany();
  await prisma.client.deleteMany();
  await prisma.clientGroup.deleteMany();
  await prisma.staff.deleteMany();

  console.log("Seeding roles...");
  await ensureSystemRoles(prisma);

  console.log("Seeding organizations...");
  const mainOrg = await prisma.organization.create({
    data: {
      name: "Sharma & Associates",
      tagline: "Chartered Accountants",
      address: "302, Meridian Business Centre, S.V. Road\nAndheri West, Mumbai 400058, Maharashtra",
      phone: "+91 22 2671 4455",
      email: "office@sharmaassociates.in",
      pan: "AAKFS3121L",
      gstin: "27AAKFS3121L1Z6",
      sacCode: "9982",
      invoicePrefix: "SA",
      bankName: "HDFC Bank, Andheri West Branch",
      bankAccount: "50200011223344",
      bankIfsc: "HDFC0000239",
      bankUpi: "sharmaassociates@hdfcbank",
      invoiceNote:
        "Payment is due within 15 days of the invoice date. Kindly quote the invoice number when remitting.",
      isDefault: true,
    },
  });
  const advisoryOrg = await prisma.organization.create({
    data: {
      name: "Sharma Advisory Services LLP",
      tagline: "Management Consultants",
      address: "302, Meridian Business Centre, S.V. Road\nAndheri West, Mumbai 400058, Maharashtra",
      phone: "+91 22 2671 4456",
      email: "advisory@sharmaassociates.in",
      pan: "AAOFS8891M",
      gstin: "27AAOFS8891M1ZK",
      sacCode: "9983",
      bankName: "ICICI Bank, Andheri West Branch",
      bankAccount: "002105012345",
      bankIfsc: "ICIC0000021",
      bankUpi: "sharmaadvisory@icici",
      invoiceNote: "Payment is due within 15 days of the invoice date.",
    },
  });

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

  console.log("Seeding client groups...");
  const [nimbusGroup, southGroup, patelGroup] = await Promise.all([
    prisma.clientGroup.create({
      data: { code: "NMB", name: "Nimbus Group", notes: "Nimbus family of companies." },
    }),
    prisma.clientGroup.create({
      data: { code: "STH", name: "South Region", notes: "Clients handled by the Bengaluru & Kochi desks." },
    }),
    prisma.clientGroup.create({
      data: { code: "PTL", name: "Patel Concerns", notes: "Suresh Patel's proprietorship concerns." },
    }),
  ]);

  console.log("Seeding clients...");
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: "Nimbus Technologies Pvt Ltd", type: "Private Limited", pan: "AABCN1234E", gstin: "27AABCN1234E1Z5",
        tan: "MUMN12345E", cin: "U72200MH2015PTC265432",
        email: "accounts@nimbustech.in", phone: "+91 22 4123 5566", contactPerson: "Rohan Mehta",
        address: "Unit 402, Solaris Business Park, Andheri East, Mumbai 400069", status: "Active",
        groupId: nimbusGroup.id,
        notes: "Monthly retainer client. GST + TDS + Annual audit.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Greenleaf Organics LLP", type: "LLP", pan: "AAGFG5678K", gstin: "29AAGFG5678K1Z2",
        tan: "BLRG08765K", llpin: "AAG-7788",
        email: "finance@greenleaf.co.in", phone: "+91 80 2345 6677", contactPerson: "Ananya Krishnan",
        address: "14, MG Road, Bengaluru 560001", status: "Active",
        groupId: southGroup.id,
        notes: "GST filings + LLP ROC compliance.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Suresh Patel", type: "Proprietorship", pan: "BXYPS9012L", gstin: "24BXYPS9012L1Z9",
        email: "sunrise.traders@gmail.com", phone: "+91 79 2211 3344", contactPerson: "Suresh Patel",
        address: "Shop 8, Ashram Road, Ahmedabad 380009", status: "Active",
        groupId: patelGroup.id,
        notes: "Proprietor running two concerns — Sunrise Traders & Patel Agro. Quarterly GST, composition scheme.",
      },
    }),
    prisma.client.create({
      data: {
        name: "Dr. Meera Bhat", type: "Individual", pan: "AKLPB3456M", aadhaar: "4567 8901 2345",
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
        tan: "HYDV03344Q", firmRegNo: "TS/HYD/2018/4521",
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

  // Map the Kochi proprietor into the South region group as well.
  await prisma.client.update({ where: { id: coastal.id }, data: { groupId: southGroup.id } });

  console.log("Seeding trade names...");
  // Suresh Patel (proprietor) runs multiple concerns, each with its own GSTIN.
  const sunriseTrade = await prisma.tradeName.create({
    data: { clientId: sunrise.id, name: "Sunrise Traders", gstin: "24BXYPS9012L1Z9", pan: "BXYPS9012L", address: "Shop 8, Ashram Road, Ahmedabad 380009" },
  });
  await prisma.tradeName.create({
    data: { clientId: sunrise.id, name: "Patel Agro Industries", gstin: "24BXYPS9012L2Z8", pan: "BXYPS9012L", address: "Plot 21, GIDC, Vatva, Ahmedabad 382445" },
  });
  // A company that trades under a brand different from its legal name.
  await prisma.tradeName.create({
    data: { clientId: coastal.id, name: "Kurian Marine Exports", gstin: "32CQWPS4455R1Z8", pan: "CQWPS4455R", address: "Harbour Road, Kochi 682003" },
  });

  console.log("Seeding tasks...");
  const taskData = [
    // Overdue / urgent
    { title: "GSTR-3B – June 2026", category: "GST", status: "In Progress", priority: "High", dueDate: daysFromNow(-2), clientId: nimbus.id, assigneeId: senior.id, description: "Monthly GST return for June 2026. Reconcile ITC before filing.", gstReturnType: "GSTR-3B", gstPeriodicity: "Monthly", periodMonth: 6, financialYear: "2026-27" },
    { title: "TDS Return – Form 138 / 24Q – Q1 FY26-27", category: "TDS", status: "Pending", priority: "High", dueDate: daysFromNow(22), clientId: apex.id, assigneeId: accountant.id, description: "Quarterly TDS return on salaries.", tdsForm: "138", periodQuarter: "Q1", returnNature: "Original", financialYear: "2026-27", checklist: [{ label: "Challans verified & mapped", done: true }, { label: "Deductee PAN details validated", done: false }, { label: "Statement validated (FVU / portal)", done: false }, { label: "Return filed & token/PRN saved", done: false }, { label: "TDS certificate for the quarter downloaded", done: false }] },
    { title: "GSTR-1 – June 2026", category: "GST", status: "Under Review", priority: "Medium", dueDate: daysFromNow(2), clientId: greenleaf.id, assigneeId: senior.id, description: "Outward supplies return." },
    { title: "Tax Audit u/s 44AB – FY 2025-26", category: "Audit", status: "Pending", priority: "High", dueDate: daysFromNow(75), clientId: vasudha.id, assigneeId: manager.id, description: "Turnover exceeds threshold. Form 3CD preparation.", taskType: "Tax Audit", financialYear: "2025-26" },
    { title: "Statutory Audit – FY 2025-26", category: "Audit", status: "In Progress", priority: "High", dueDate: daysFromNow(60), clientId: apex.id, assigneeId: partner.id, description: "Companies Act statutory audit. Fieldwork ongoing.", taskType: "Statutory Audit", financialYear: "2025-26", checklist: [{ label: "Engagement letter signed", done: true }, { label: "Books, ledgers & schedules obtained", done: true }, { label: "Vouching & verification completed", done: false }, { label: "Financial statements & notes finalized", done: false }, { label: "Audit report & CARO finalized (UDIN generated)", done: false }, { label: "Adopted by Board/AGM & filed with MCA", done: false }] },
    { title: "ITR Filing – AY 2026-27", category: "Income Tax", status: "Pending", priority: "Medium", dueDate: daysFromNow(21), clientId: meera.id, assigneeId: senior.id, description: "Individual return with capital gains from equity.", taskType: "ITR Filing", financialYear: "2025-26" },
    { title: "ITR & HUF Filing – AY 2026-27", category: "Income Tax", status: "Pending", priority: "Low", dueDate: daysFromNow(21), clientId: huf.id, assigneeId: accountant.id, description: "HUF return, house property income." },
    { title: "GST LUT Renewal – FY 2026-27", category: "GST", status: "Completed", priority: "Medium", dueDate: daysFromNow(-90), completedAt: daysFromNow(-88), clientId: coastal.id, assigneeId: senior.id, description: "Letter of Undertaking for export without payment of tax." },
    { title: "DIR-3 KYC – Directors", category: "MCA/ROC", status: "Pending", priority: "Medium", dueDate: daysFromNow(80), clientId: nimbus.id, assigneeId: manager.id, description: "Annual KYC of directors on MCA portal." },
    { title: "Form 11 – LLP Annual Return", category: "MCA/ROC", status: "Pending", priority: "Low", dueDate: daysFromNow(45), clientId: greenleaf.id, assigneeId: article.id, description: "LLP annual return filing." },
    { title: "Form 10B Audit – Trust", category: "Audit", status: "Pending", priority: "Medium", dueDate: daysFromNow(85), clientId: trust.id, assigneeId: manager.id, description: "Audit report for charitable trust u/s 12A.", taskType: "Trust and NGO Audit", financialYear: "2025-26" },
    { title: "GSTR-3B – Q1 (Composition)", category: "GST", status: "Completed", priority: "Low", dueDate: daysFromNow(-25), completedAt: daysFromNow(-26), clientId: sunrise.id, assigneeId: accountant.id, description: "CMP-08 quarterly statement." },
    { title: "Book-keeping – June 2026", category: "Other", status: "In Progress", priority: "Medium", dueDate: daysFromNow(5), clientId: nimbus.id, assigneeId: accountant.id, description: "Monthly accounting and bank reconciliation." },
    { title: "GST Registration Amendment", category: "Registration", status: "Under Review", priority: "Low", dueDate: daysFromNow(10), clientId: coastal.id, assigneeId: article.id, description: "Add additional place of business." },
    { title: "Advance Tax Computation – Q1", category: "Income Tax", status: "Completed", priority: "Medium", dueDate: daysFromNow(-24), completedAt: daysFromNow(-27), clientId: apex.id, assigneeId: manager.id, description: "First installment advance tax working." },
    { title: "GSTR-9 Annual Return – FY 2024-25", category: "GST", status: "Pending", priority: "Medium", dueDate: daysFromNow(170), clientId: greenleaf.id, assigneeId: senior.id, description: "Annual GST reconciliation return.", gstReturnType: "GSTR-9", financialYear: "2024-25" },
  ];
  // GST / income-tax / TDS tasks are treated as return filings; a completed
  // one carries its filing date + acknowledgement number.
  const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];
  let ackSeq = 100;
  for (const t of taskData) {
    const isReturnFiling = RETURN_CATEGORIES.includes(t.category);
    const filed = isReturnFiling && t.status === "Completed";
    await prisma.task.create({
      data: {
        ...t,
        isReturnFiling,
        ...(filed
          ? { filingDate: t.completedAt, ackNumber: `AA${240000000000 + ackSeq++}` }
          : {}),
      },
    });
  }

  console.log("Seeding invoices...");
  const invoiceData = [
    { invoiceNumber: "SA/26-27/001", clientId: nimbus.id, description: "Retainership fee – Apr to Jun 2026", amount: 45000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-40), dueDate: daysFromNow(-25), paidDate: daysFromNow(-20), receiptNumber: "SA/26-27/R001" },
    { invoiceNumber: "SA/26-27/002", clientId: apex.id, amount: 125000, taxRate: 18, status: "Sent", issueDate: daysFromNow(-15), dueDate: daysFromNow(15), lines: [{ description: "Statutory audit fee – FY 2025-26", amount: 90000 }, { description: "Tax audit fee u/s 44AB – FY 2025-26", amount: 35000 }] },
    { invoiceNumber: "SA/26-27/003", clientId: greenleaf.id, description: "GST compliance – Q1 FY26-27", amount: 22000, taxRate: 18, status: "Overdue", issueDate: daysFromNow(-35), dueDate: daysFromNow(-5) },
    { invoiceNumber: "SA/26-27/004", clientId: meera.id, description: "ITR filing & advisory – AY 2026-27", amount: 8000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-12), dueDate: daysFromNow(3), paidDate: daysFromNow(-8), receiptNumber: "SA/26-27/R002" },
    { invoiceNumber: "SA/26-27/005", clientId: coastal.id, organizationId: advisoryOrg.id, description: "Advisory: GST export refund filing", amount: 18000, taxRate: 18, status: "Sent", issueDate: daysFromNow(-8), dueDate: daysFromNow(22) },
    { invoiceNumber: "SA/26-27/006", clientId: vasudha.id, description: "Tax audit fee – FY 2025-26 (advance)", amount: 60000, taxRate: 18, gstMode: "None", status: "Draft", issueDate: daysFromNow(-2) },
    // Billed under the proprietor's trade name "Sunrise Traders".
    { invoiceNumber: "SA/26-27/007", clientId: sunrise.id, tradeNameId: sunriseTrade.id, description: "Quarterly GST + accounting", amount: 12000, taxRate: 18, status: "Paid", issueDate: daysFromNow(-30), dueDate: daysFromNow(-15), paidDate: daysFromNow(-14), receiptNumber: "SA/26-27/R003" },
    { invoiceNumber: "SA/26-27/008", clientId: trust.id, description: "12A/80G renewal & Form 10B", amount: 35000, taxRate: 18, status: "Overdue", issueDate: daysFromNow(-50), dueDate: daysFromNow(-20) },
  ];
  for (const inv of invoiceData) {
    const { lines, ...rest } = inv as (typeof inv) & {
      lines?: { description: string; amount: number }[];
    };
    await prisma.invoice.create({
      data: {
        organizationId: mainOrg.id,
        ...rest,
        ...(lines && lines.length ? { lineItems: { create: lines } } : {}),
      },
    });
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

  console.log("Seeding DSC register...");
  const dscData = [
    { holderName: "Rohan Mehta", class: "Class 3", authority: "eMudhra", serialNumber: "EM-4471-8823", email: "rohan.mehta@nimbustech.in", phone: "+91 98200 90011", issueDate: daysFromNow(-700), expiryDate: daysFromNow(30 + 335), custody: "With Firm", location: "Locker A, Tray 2", clientId: nimbus.id },
    { holderName: "Nikhil Joshi", class: "Class 3", authority: "Sify SafeScrypt", serialNumber: "SF-9032-1156", email: "nikhil.joshi@apexconstructions.in", phone: "+91 98200 33445", issueDate: daysFromNow(-1050), expiryDate: daysFromNow(18), custody: "With Firm", location: "Locker A, Tray 1", clientId: apex.id, notes: "Renewal quote requested from Sify." },
    { holderName: "Ananya Krishnan", class: "Class 3", authority: "Capricorn", serialNumber: "CP-2288-7741", email: "ananya@greenleaf.co.in", issueDate: daysFromNow(-745), expiryDate: daysFromNow(-12), custody: "With Firm", location: "Locker B", clientId: greenleaf.id, notes: "EXPIRED — renewal documents awaited from client." },
    { holderName: "Suresh Patel", class: "Class 3", authority: "eMudhra", serialNumber: "EM-5521-0098", phone: "+91 98790 11223", issueDate: daysFromNow(-400), expiryDate: daysFromNow(330), custody: "With Client", clientId: sunrise.id },
    { holderName: "Lakshmi Reddy", class: "Class 3", authority: "VSign", serialNumber: "VS-7710-3390", email: "lakshmi@vasudhahandlooms.in", issueDate: daysFromNow(-300), expiryDate: daysFromNow(430), custody: "With Firm", location: "Locker A, Tray 3", clientId: vasudha.id },
    { holderName: "Thomas Kurian", class: "DGFT", authority: "PantaSign", serialNumber: "PS-1120-6634", email: "exports@coastalseafoods.in", issueDate: daysFromNow(-500), expiryDate: daysFromNow(230), custody: "With Firm", location: "Locker B", clientId: coastal.id, notes: "DGFT DSC used for export licence filings." },
    { holderName: "Rhea Kapoor", class: "Class 3", authority: "eMudhra", serialNumber: "EM-8873-4412", issueDate: daysFromNow(-900), expiryDate: daysFromNow(-150), status: "Surrendered", custody: "With Client", clientId: zephyr.id, notes: "Surrendered on company dormancy." },
  ];
  const dscs = [];
  for (const d of dscData) {
    dscs.push(await prisma.dsc.create({ data: d }));
  }
  await prisma.dscMovement.createMany({
    data: [
      { dscId: dscs[0].id, direction: "In", byName: "Sneha Iyer", note: "Received for GSTR-9 filing season", createdAt: daysFromNow(-40) },
      { dscId: dscs[1].id, direction: "In", byName: "Amit Deshpande", note: "Received for statutory audit sign-off", createdAt: daysFromNow(-15) },
      { dscId: dscs[3].id, direction: "Out", byName: "Vikram Rao", note: "Returned after CMP-08 filing", createdAt: daysFromNow(-20) },
    ],
  });

  console.log("Seeding inward/outward register...");
  const packetData = [
    { inwardNumber: "IN-2627-001", receivedFrom: "Rohan Mehta", contents: "Signed financial statements FY25-26 (3 sets), board resolution originals", purpose: "Statutory audit", mode: "Hand Delivery", location: "Almirah 1, Shelf B", status: "In Custody", receivedByName: "Sneha Iyer", receivedAt: daysFromNow(-18), clientId: nimbus.id },
    { inwardNumber: "IN-2627-002", receivedFrom: "Office boy of Suresh Patel", contents: "Purchase bills Apr-Jun 2026 (1 file), bank statement originals", purpose: "CMP-08 & accounting", mode: "Hand Delivery", location: "Almirah 2, Shelf A", status: "Returned", receivedByName: "Vikram Rao", receivedAt: daysFromNow(-30), clientId: sunrise.id },
    { inwardNumber: "IN-2627-003", receivedFrom: "Kavita Singh", contents: "Original 12A registration order, donation receipts FY25-26 (2 folders)", purpose: "Form 10B audit", mode: "Courier", courierRef: "BlueDart 4491022837", location: "Almirah 1, Shelf D", status: "In Custody", receivedByName: "Amit Deshpande", receivedAt: daysFromNow(-10), clientId: trust.id },
    { inwardNumber: "IN-2627-004", receivedFrom: "Nikhil Joshi", contents: "Original property sale deed + TDS challans (26QB)", purpose: "Capital gains computation", mode: "Hand Delivery", location: "Safe locker", status: "In Custody", receivedByName: "CA Priya Nair", receivedAt: daysFromNow(-95), clientId: apex.id, notes: "High-value originals — partner approval needed for release." },
    { inwardNumber: "IN-2627-005", receivedFrom: "Dr. Meera Bhat", contents: "Form 16, capital gains statements, LIC premium receipts", purpose: "ITR AY 2026-27", mode: "Post", location: "Tray – current filings", status: "In Custody", receivedByName: "Sneha Iyer", receivedAt: daysFromNow(-5), clientId: meera.id },
  ];
  const packets = [];
  for (const p of packetData) {
    packets.push(await prisma.docPacket.create({ data: p }));
  }
  await prisma.packetMovement.createMany({
    data: [
      { packetId: packets[1].id, direction: "Out", outwardNumber: "OUT-2627-001", person: "Suresh Patel", mode: "Hand Delivery", note: "All bills returned after data entry; acknowledgement taken.", byName: "Vikram Rao", createdAt: daysFromNow(-8) },
    ],
  });

  console.log("Seeding ITR filings...");
  // Current filing season (July 2026) covers FY 2025-26 (→ AY 2026-27); the
  // prior year's processed returns are for FY 2024-25 (→ AY 2025-26).
  const [, fyCurrent, fyPrev] = financialYears();
  const itrData = [
    { clientId: meera.id, financialYear: fyCurrent, formType: "ITR-2", regime: "New", status: "In Preparation", assigneeId: senior.id, notes: "Capital gains statements received; broker P&L pending." },
    { clientId: huf.id, financialYear: fyCurrent, formType: "ITR-2", regime: "Old", status: "Documents Awaited", assigneeId: accountant.id, notes: "House property rent receipts awaited." },
    { clientId: sunrise.id, financialYear: fyCurrent, formType: "ITR-3", regime: "New", status: "Documents Awaited", assigneeId: accountant.id },
    { clientId: vasudha.id, financialYear: fyCurrent, formType: "ITR-5", regime: "New", status: "In Preparation", assigneeId: manager.id, notes: "To file after tax audit sign-off." },
    { clientId: coastal.id, financialYear: fyCurrent, formType: "ITR-3", regime: "New", status: "Filed", filedOn: daysFromNow(-3), ackNumber: "445566778899001", assigneeId: senior.id },
    { clientId: meera.id, financialYear: fyPrev, formType: "ITR-2", regime: "New", status: "Processed", filedOn: daysFromNow(-345), ackNumber: "123456789012345", refundAmount: 18450, assigneeId: senior.id },
    { clientId: sunrise.id, financialYear: fyPrev, formType: "ITR-3", regime: "New", status: "E-Verified", filedOn: daysFromNow(-350), ackNumber: "987654321098765", assigneeId: accountant.id },
  ];
  for (const f of itrData) {
    await prisma.itrFiling.create({ data: f });
  }

  console.log("Seeding reminder settings...");
  await prisma.notificationLog.deleteMany();
  await prisma.reminderSettings.deleteMany();
  await prisma.reminderSettings.create({
    data: {
      id: "default",
      enabled: true,
      leadDays: 7,
      notifyAssignee: true,
      notifyClient: true,
      channelEmail: true,
      channelWhatsapp: true,
    },
  });
  await prisma.notificationLog.createMany({
    data: [
      { channel: "Email", recipientType: "Staff", recipientName: "Amit Deshpande", to: "amit@sharmaassociates.in", subject: "Reminder: GSTR-3B – June 2026 (due 20 Jul 2026)", body: "Hi Amit,\n\nReminder: GSTR-3B – June 2026 for Nimbus Technologies is due in 11 days.\n\n— Sharma & Associates", status: "Simulated", dedupeKey: "seed-1" },
      { channel: "WhatsApp", recipientType: "Client", recipientName: "Ananya Krishnan", to: "+91 80 2345 6677", subject: "Reminder: GSTR-1 – June 2026", body: "Dear Ananya, a reminder from Sharma & Associates: GSTR-1 is due on 11 Jul 2026. Please share the required details.", status: "Simulated", dedupeKey: "seed-2" },
    ],
  });

  const counts = {
    staff: await prisma.staff.count(),
    clients: await prisma.client.count(),
    tasks: await prisma.task.count(),
    invoices: await prisma.invoice.count(),
    documents: await prisma.document.count(),
    schedules: await prisma.complianceSchedule.count(),
    dscs: await prisma.dsc.count(),
    packets: await prisma.docPacket.count(),
    orgs: await prisma.organization.count(),
    itrFilings: await prisma.itrFiling.count(),
  };
  console.log("Seed complete:", counts);
  return counts;
}
