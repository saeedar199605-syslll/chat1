// pdfjs (~1 MB) and docx are loaded on first use so they stay out of the main bundle.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    }
  );
  return pdfjsPromise;
}

export interface PdfPagePreview {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  text: string;
}

export interface PdfInspectionResult {
  pageCount: number;
  pages: PdfPagePreview[];
  fullText: string;
}

async function fetchPdfBytes(source: string | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
  if (source instanceof Uint8Array) return source;
  return new Uint8Array(source);
}

export async function inspectPdfSource(
  source: string | ArrayBuffer | Uint8Array,
  options?: { maxPages?: number; scale?: number }
): Promise<PdfInspectionResult> {
  const maxPages = options?.maxPages ?? 8;
  const scale = options?.scale ?? 1.4;
  const data = await fetchPdfBytes(source);
  const loadingTask = (await loadPdfjs()).getDocument({ data });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);
  const pages: PdfPagePreview[] = [];
  const textChunks: string[] = [];

  for (let p = 1; p <= limit; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    textChunks.push(pageText);
    pages.push({
      pageNumber: p,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      text: pageText,
    });
  }

  return {
    pageCount,
    pages,
    fullText: textChunks.filter(Boolean).join('\n\n'),
  };
}

export async function renderPdfPageToPngBlob(
  source: string | ArrayBuffer | Uint8Array,
  pageNumber = 1,
  scale = 2.0
): Promise<Blob> {
  const data = await fetchPdfBytes(source);
  const pdf = await (await loadPdfjs()).getDocument({ data }).promise;
  const safePage = Math.max(1, Math.min(pageNumber, pdf.numPages));
  const page = await pdf.getPage(safePage);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('PNG export failed'));
      else resolve(blob);
    }, 'image/png');
  });
}

export async function convertPdfSourceToDocxBlob(
  source: string | ArrayBuffer | Uint8Array,
  documentTitle = 'Converted PDF Document'
): Promise<{ blob: Blob; pageCount: number; extractedChars: number }> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const data = await fetchPdfBytes(source);
  const pdf = await (await loadPdfjs()).getDocument({ data }).promise;

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      text: documentTitle,
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
    }),
  ];

  let totalChars = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = '';

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      currentLine += str;
      if ('hasEOL' in item && item.hasEOL) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
      } else {
        currentLine += ' ';
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    children.push(
      new Paragraph({
        text: `Page ${p} / صفحه ${p}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 120 },
      })
    );

    if (lines.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '(No selectable text found on this page)', italics: true })],
        })
      );
    } else {
      for (const line of lines) {
        totalChars += line.length;
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  return { blob, pageCount: pdf.numPages, extractedChars: totalChars };
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
