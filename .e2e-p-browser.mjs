import { chromium } from "playwright";

const BASE = "http://localhost:4013";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { failN++; console.log(`FAIL ${name} ${extra}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[type="email"]', "rajesh@sharmaassociates.in");
await page.fill('input[type="password"]', "partner@123");
await page.click('button[type="submit"]');
await page.waitForURL("**/");

// Create a reimbursement invoice through the form
await page.goto(`${BASE}/invoices`);
await page.click('button:has-text("New Invoice")');
await page.waitForSelector('text=Invoice type');
// Kind = Reimbursement (select right below the "Invoice type" label)
await page.selectOption('select:below(:text("Invoice type"))', "Reimbursement");
// Client: pick the first real option in the client select
await page.selectOption('select:below(:text("Client"))', { index: 1 });
// One line item
await page.fill('input[placeholder^="Service, e.g."]', "Site visit conveyance");
await page.fill('input[placeholder="Amount ₹"]', "1500");
await page.click('button:has-text("Create invoice")');
await page.waitForSelector('span:text("Expense reimbursement")', { timeout: 15000 });
check("reimbursement badge visible in list", true);
const expNumber = await page
  .locator('tr:has(span:text("Expense reimbursement")) p')
  .first()
  .innerText();
check("EXP number series shown", expNumber.includes("/EXP/"), expNumber);

// Kind filter narrows the list
await page.selectOption('select:has(option[value="Reimbursement"])', "Reimbursement");
await page.waitForTimeout(400);
const rows = await page.locator("table tbody tr").count();
const badges = await page.locator('span:text("Expense reimbursement")').count();
check("filter shows only reimbursement bills", rows === badges && rows > 0, `rows=${rows} badges=${badges}`);
await page.selectOption('select:has(option[value="Reimbursement"])', "All");

// Receipt register tab shows the exclusion note and no EXP rows
await page.click('button:has-text("Receipt Register")');
await page.waitForSelector("text=excluded from this register", { timeout: 15000 });
check("register shows exclusion note", true);
const regText = await page.locator("table").last().innerText().catch(() => "");
check("register table has no EXP rows", !regText.includes("/EXP/"));

await browser.close();
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
