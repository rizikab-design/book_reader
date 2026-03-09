/** Minimal type definitions for epub.js APIs used in the reader */

export interface EpubNavItem {
  label: string;
  href: string;
  subitems?: EpubNavItem[];
}

export interface EpubLocation {
  start: {
    displayed: { page: number; total: number };
    cfi: string;
    percentage: number;
  };
}

export interface EpubContents {
  document: Document;
}

export interface EpubRendition {
  display(target?: string | number): Promise<void>;
  next(): void;
  prev(): void;
  destroy(): void;
  getContents(): EpubContents[];
  on(event: string, callback: (...args: unknown[]) => void): void;
  hooks: {
    content: {
      register(callback: (contents: EpubContents) => void): void;
    };
  };
}

export interface EpubSpineItem {
  href: string;
  load(loader: unknown): Promise<void>;
  unload(): void;
  find(query: string): Promise<{ cfi: string; excerpt: string }[]>;
  document?: Document;
  contents?: string;
}

export interface EpubSpine {
  each(callback: (item: EpubSpineItem) => void): void;
  items: EpubSpineItem[];
}

export interface EpubBook {
  renderTo(element: HTMLElement, options: Record<string, unknown>): EpubRendition;
  loaded: {
    navigation: Promise<{ toc: EpubNavItem[] }>;
  };
  ready: Promise<void>;
  spine: EpubSpine;
  locations: {
    generate(chars: number): Promise<void>;
  };
  load: unknown;
}
