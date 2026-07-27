import { NextRequest, NextResponse } from "next/server";
import { generateCsvTemplate, generateXlsxTemplateBuffer } from "@/lib/employees/template";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "xlsx") {
    const buffer = generateXlsxTemplateBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="employee_import_template.xlsx"',
      },
    });
  }

  const csv = generateCsvTemplate();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="employee_import_template.csv"',
    },
  });
}
