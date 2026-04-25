import * as pdfjs from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MAX_PAGES = 100;
/** Local cap before trimming again for the API payload. */
const MAX_EXTRACT_CHARS = 400_000;

function isTextItem(item: unknown): item is { str: string } {
  return Boolean(item && typeof item === "object" && "str" in item && typeof (item as { str: unknown }).str === "string");
}

/**
 * Extract plain text from a PDF in the browser (no upload to a server).
 * Scanned/image-only PDFs may yield little or no text.
 */
export async function extractPdfTextFromFile(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please choose a PDF file.");
  }

  const raw = await file.arrayBuffer();
  const data = new Uint8Array(raw);
  const pdf = await pdfjs.getDocument({ data }).promise;

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const parts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const line = textContent.items.map((item) => (isTextItem(item) ? item.str : "")).join(" ");
      parts.push(line);
    }

    let text = parts
      .join("\n\n")
      .replace(/[\t\r]+/g, " ")
      .replace(/ +/g, " ")
      .trim();

    if (pdf.numPages > MAX_PAGES) {
      text += `\n\n[Extracted first ${MAX_PAGES} of ${pdf.numPages} pages.]`;
    }

    if (text.length > MAX_EXTRACT_CHARS) {
      text = `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[Truncated after ${MAX_EXTRACT_CHARS} characters.]`;
    }

    return text;
  } finally {
    await pdf.destroy();
  }
}
