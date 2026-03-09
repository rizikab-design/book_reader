/** Minimal type definitions for pdf.js APIs used in the reader */

export interface PDFPageViewport {
  width: number;
  height: number;
}

export interface PDFTextItem {
  str: string;
  height?: number;
}

export interface PDFTextContent {
  items: PDFTextItem[];
}

export interface PDFRenderTask {
  promise: Promise<void>;
}

export interface PDFPage {
  getViewport(options: { scale: number }): PDFPageViewport;
  render(options: { canvasContext: CanvasRenderingContext2D | null; viewport: PDFPageViewport }): PDFRenderTask;
  getTextContent(): Promise<PDFTextContent>;
}

export interface PDFOutlineItem {
  title: string;
  dest: string | unknown[] | null;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNum: number): Promise<PDFPage>;
  getOutline(): Promise<PDFOutlineItem[] | null>;
  getDestination(dest: string): Promise<unknown[]>;
  getPageIndex(ref: unknown): Promise<number>;
}
