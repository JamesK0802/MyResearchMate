import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workDir = path.dirname(new URL(import.meta.url).pathname);
const sources = [
  ["provided", "/Users/james/Downloads/CRISPR_tool_feature_comparison-1.xlsx"],
  ["prior", "/Users/james/Desktop/MyResearchMate/MyResearchMate/outputs/01a02d27-47b4-7e20-86f5-c80e197f5a3d/CRISPR_analysis_tool_comparison_2026-08-25.xlsx"],
];

for (const [label, filename] of sources) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filename));
  const overview = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 12000,
    tableMaxRows: 12,
    tableMaxCols: 12,
    tableMaxCellChars: 140,
  });
  await fs.writeFile(path.join(workDir, `${label}-inspect.ndjson`), overview.ndjson, "utf8");

  const sheets = workbook.worksheets.items;
  for (let i = 0; i < sheets.length; i += 1) {
    const sheet = sheets[i];
    const safe = sheet.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const image = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(path.join(workDir, `${label}-${i + 1}-${safe}.png`), new Uint8Array(await image.arrayBuffer()));
  }
}
