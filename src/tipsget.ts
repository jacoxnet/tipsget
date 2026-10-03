import { writeFileSync } from "node:fs";

const filename = "tips.csv";
const baseUrlt = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const summaryEndpoint = "/v1/accounting/od/tips_cpi_data_summary";
const detailsEndpoint = "/v1/accounting/od/tips_cpi_data_detail";
const baseUrlfed = "https://api.stlouisfed.org/fred/series/observations";
const fedAPIkey = process.env.FRED_API_KEY;
const mikefields = {
  cusip: "Cusip", interest_rate: "Coupon", maturity_date: "Maturity Date",
  security_term: "Term", series: "Series", original_issue_date: "Issue Date",
  index_ratio: "Inflation Factor", index_date: "Inflation Date", ref_cpi_on_dated_date: "Dated date CPI-U",
} as const;

type ApiRecord = Record<string, string | null | undefined>;
type CsvValue = string | number | null | undefined;
type Tip = Record<string, CsvValue>;

interface FredResponse {
  observations: { date: string; value: string }[];
}

// return date in string format YYYY-MM-DD (local time) for use in API calls and file output
function convertDate(theDate: Date): string {
  const mm = String(theDate.getMonth() + 1).padStart(2, "0");
  const dd = String(theDate.getDate()).padStart(2, "0");
  return `${theDate.getFullYear()}-${mm}-${dd}`;
}

// subtract months, clamping to the last day of the target month (same as dateutil's relativedelta)
function subtractMonths(theDate: Date, months: number): Date {
  const target = new Date(theDate.getFullYear(), theDate.getMonth() - months, 1);
  const day = Math.min(theDate.getDate(), daysInMonth(target));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

function daysInMonth(theDate: Date): number {
  return new Date(theDate.getFullYear(), theDate.getMonth() + 1, 0).getDate();
}

async function getJson<T>(url: string, params: Record<string, string> = {}): Promise<T> {
  const fullUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    fullUrl.searchParams.set(key, value);
  }
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function getAllTips(): Promise<ApiRecord[]> {
  console.log("Getting summary TIPS data...");
  const body = await getJson<{ data: ApiRecord[] }>(baseUrlt + summaryEndpoint);
  return body.data;
}

// return list of indexes with index date and index ratio for theDate
async function getIndexes(theDate: Date): Promise<ApiRecord[]> {
  console.log("Getting index details ...");
  const body = await getJson<{ data: ApiRecord[] }>(baseUrlt + detailsEndpoint, {
    filter: "index_date:eq:" + convertDate(theDate),
  });
  return body.data;
}

// return CPI-U for theDate which is used in calculating TIPS interest between index date and maturity date
async function getCpiu(theDate: Date): Promise<number> {
  console.log("Getting CPI-U data ...");
  if (!fedAPIkey) {
    throw new Error("FRED_API_KEY environment variable is not set");
  }
  // calculate date 3 months prior to theDate which is used in TIPS
  const cpuDate = subtractMonths(theDate, 3);
  const cpiuData = await getJson<FredResponse>(baseUrlfed, {
    series_id: "CPIAUCNS", observation_start: convertDate(cpuDate),
    observation_end: convertDate(theDate), api_key: fedAPIkey,
    file_type: "json",
  });
  // calculate daily increase in CPI-U for use in calculating TIPS interest between index date and maturity date
  const ob1 = parseFloat(cpiuData.observations[0].value);
  const ob2 = parseFloat(cpiuData.observations[1].value);
  console.log("ob1: ", ob1, "ob2: ", ob2);
  const dailyCpiuInc = (ob2 - ob1) / daysInMonth(theDate);
  console.log("daily_cpiu_inc: ", dailyCpiuInc);
  // return daily increase times days so far in this month to get increase in CPI-U since index date
  return ob1 + dailyCpiuInc * (theDate.getDate() - 1);
}

// search indexList for cusip and return index info if found, otherwise return empty record
function findIndex(cusip: CsvValue, indexList: ApiRecord[]): ApiRecord {
  return indexList.find((indexItem) => indexItem.cusip === cusip) ?? {};
}

// round like Python's round(x, ndigits): toFixed rounds the exact binary value
function roundTo(x: number, digits: number): number {
  return Number(x.toFixed(digits));
}

// format a value the way Python's csv module does (floats keep a trailing .0, None is empty)
function formatValue(value: CsvValue, isFloat: boolean): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return isFloat && Number.isInteger(value) ? value.toFixed(1) : String(value);
  }
  return value;
}

function csvEscape(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

// write tips to csv file
function writefile(tips: Tip[]): void {
  console.log("Writing csv file ...");
  const fieldnames = Object.keys(tips[0]);
  const floatFields = new Set(["Adjusted Principal", "Current CPIU", "Calculated Inflation Factor"]);
  const lines = [fieldnames.map(csvEscape).join(",")];
  for (const tip of tips) {
    lines.push(fieldnames.map((f) => csvEscape(formatValue(tip[f], floatFields.has(f)))).join(","));
  }
  writeFileSync(filename, lines.join("\n") + "\n");
}

async function main(): Promise<void> {
  const idate = new Date();
  const tipsList = await getAllTips();
  console.log("Total tips received :", tipsList.length);
  // go thru recovered fields and place selected ones in myTips
  const myTips: Tip[] = tipsList.map((tip) => {
    const myTip: Tip = {};
    for (const [fieldname, label] of Object.entries(mikefields)) {
      if (tip[fieldname]) {
        myTip[label] = tip[fieldname];
      }
    }
    return myTip;
  });
  const indexList = await getIndexes(idate);
  console.log("total indexes received: ", indexList.length);
  // go thru tips and search for and recover index info
  const cpiu = await getCpiu(idate);
  for (const tip of myTips) {
    const index = findIndex(tip[mikefields.cusip], indexList);
    tip[mikefields.index_ratio] = index.index_ratio;
    tip[mikefields.index_date] = index.index_date;
    const ratio = tip[mikefields.index_ratio];
    tip["Adjusted Principal"] = ratio ? Math.trunc(parseFloat(String(ratio)) * 100000) / 100 : null;
    tip["Current CPIU"] = cpiu;
    tip["Calculated Inflation Factor"] = roundTo(cpiu / parseFloat(String(tip[mikefields.ref_cpi_on_dated_date])), 5);
  }
  myTips.sort((a, b) => {
    const [ma, mb] = [String(a["Maturity Date"]), String(b["Maturity Date"])];
    return ma < mb ? -1 : ma > mb ? 1 : 0;
  });
  writefile(myTips);
  console.log("All done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
