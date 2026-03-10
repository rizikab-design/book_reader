import type { CSSProperties } from 'react';

export const COLORS = {
  primary: '#2f95dc',
  error: '#c00',
  text: '#333',
  textMuted: '#999',
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
  panelBg: '#fafafa',
} as const;

export const PANEL_STYLES: Record<string, CSSProperties> = {
  dropdown: {
    backgroundColor: '#fafafa',
    border: '1px solid #e8e8e8',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  },
  iconButtonSmall: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#999',
  },
  emptyState: {
    padding: '30px 20px',
    textAlign: 'center' as const,
    color: '#999',
    fontSize: '13px',
  },
};

// --- Shared reader styles (used by both ePub and PDF readers) ---

const BASE_READER_STYLES: Record<string, CSSProperties> = {
  // Layout
  container: { display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' },
  mainContent: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e8e8e8', minHeight: '44px' },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px', justifyContent: 'flex-end' },
  bookTitleText: { fontSize: '14px', fontWeight: 500, textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconButton: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: '#555', borderRadius: '4px', fontSize: '20px' },

  // Navigation
  pageChevron: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', flexShrink: 0, transition: 'opacity 0.15s' },

  // Progress bar
  progressTrack: { height: '3px', backgroundColor: '#e0e0e0', width: '100%', flexShrink: 0 },
  progressFill: { height: '100%', backgroundColor: '#2f95dc', transition: 'width 0.3s ease', borderRadius: '0 2px 2px 0' },

  // Selection popup
  selectionPopup: { position: 'fixed', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '12px', padding: '0 12px 12px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100, width: '280px' },
  dragOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, cursor: 'grabbing' },
  dragHandle: { cursor: 'grab', padding: '8px 0 4px 0', display: 'flex', justifyContent: 'center', userSelect: 'none' as const },
  dragDots: { width: '36px', height: '4px', borderRadius: '2px', backgroundColor: '#ccc' },
  colorPicker: { display: 'flex', gap: '8px', marginBottom: '8px' },
  popupPreview: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4', fontStyle: 'italic' },
  noteInput: { width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  popupActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' },
  cancelBtn: { background: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: '#666' },
  saveBtn: { background: '#2f95dc', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: '#fff' },

  // Keyboard shortcuts
  shortcutsOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  shortcutsPanel: { width: '320px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' },
  shortcutRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' },
  shortcutKey: { display: 'inline-block', padding: '2px 8px', fontSize: '12px', fontFamily: 'monospace', backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', minWidth: '40px', textAlign: 'center' as const },

  // Toast
  toast: { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, zIndex: 200, pointerEvents: 'none', animation: 'fadeInOut 2s ease' },
};

// --- ePub-specific reader styles ---

export const READER_STYLES: Record<string, CSSProperties> = {
  ...BASE_READER_STYLES,

  container: { ...BASE_READER_STYLES.container, backgroundColor: '#fff' },
  mainContent: { ...BASE_READER_STYLES.mainContent, flexDirection: 'row' },
  pageChevron: { ...BASE_READER_STYLES.pageChevron, opacity: 0.3 },
  selectionPopup: { ...BASE_READER_STYLES.selectionPopup, transform: 'translateX(-50%)' },

  // ePub aliases (keep old names working)
  iconButtonSmall: PANEL_STYLES.iconButtonSmall,
  popupDragHandle: BASE_READER_STYLES.dragHandle,
  popupButtonCancel: BASE_READER_STYLES.cancelBtn,
  popupButtonSave: BASE_READER_STYLES.saveBtn,
  progressBarTrack: BASE_READER_STYLES.progressTrack,
  progressBarFill: BASE_READER_STYLES.progressFill,

  pageChevronLeft: { paddingLeft: '4px' },
  pageChevronRight: { paddingRight: '4px' },
  readerPanel: { flex: 1, position: 'relative', overflow: 'hidden' },
  reader: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10 },

  // Themes dropdown
  themesDropdown: { position: 'absolute', top: '44px', right: '50px', width: '280px', backgroundColor: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 50, overflow: 'hidden' },
  fontSizeRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '12px 16px', borderBottom: '1px solid #eee' },
  fontSizeButton: { background: 'none', border: '1px solid #ddd', borderRadius: '8px', width: '44px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' },
  themeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', padding: '16px' },
  themeCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 8px', borderRadius: '12px', cursor: 'pointer', minHeight: '70px', transition: 'border-color 0.15s' },

  // Highlights dropdown
  highlightsDropdown: { ...PANEL_STYLES.dropdown, position: 'absolute', top: '44px', left: '12px', width: '300px', maxHeight: '500px' },
  highlightDropdownItem: { display: 'flex', gap: '8px', borderBottom: '1px solid #f0f0f0' },
  highlightTextButton: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px 4px 12px', fontSize: '13px', color: '#333', cursor: 'pointer', lineHeight: '1.4' },
  sidebarAction: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#2f95dc', padding: 0 },

  // TOC
  tocPanel: { width: '280px', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa', zIndex: 10, flexShrink: 0 },
  tocHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', fontSize: '14px' },
  tocList: { flex: 1, overflow: 'auto' },
  tocItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '10px 16px', fontSize: '13px', color: '#333', cursor: 'pointer', lineHeight: '1.4' },

  // Bookmarks dropdown
  bookmarksDropdown: { ...PANEL_STYLES.dropdown, position: 'absolute', top: '44px', right: '12px', width: '260px', maxHeight: '400px' },
  bookmarksEmpty: PANEL_STYLES.emptyState,
  bookmarkItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', padding: '0 4px 0 0' },
  bookmarkLink: { flex: 1, background: 'none', border: 'none', textAlign: 'left', padding: '10px 16px', fontSize: '13px', color: '#333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  bookmarkPage: { fontSize: '11px', color: '#999', flexShrink: 0 },
  bookmarkTitleInput: { width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' as const },

  // Search panel
  searchPanel: { ...PANEL_STYLES.dropdown, position: 'absolute', top: '44px', right: '100px', width: '320px', maxHeight: '450px' },
  searchInput: { width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', outline: 'none', boxSizing: 'border-box' as const },
};

// --- PDF-specific reader styles ---

export const PDF_READER_STYLES: Record<string, CSSProperties> = {
  ...BASE_READER_STYLES,

  mainContent: { ...BASE_READER_STYLES.mainContent, alignItems: 'center' },
  dragHandle: { ...BASE_READER_STYLES.dragHandle, padding: '6px 0 4px 0' },
  dragDots: { ...BASE_READER_STYLES.dragDots, width: '32px' },

  // PDF aliases (keep old names working)
  closeBtn: PANEL_STYLES.iconButtonSmall,
  dropdownHeader: PANEL_STYLES.dropdownHeader,
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: 0 },

  // PDF-specific layout
  pdfContainer: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', position: 'relative' },
  centerOverlay: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '14px', padding: '40px' },

  // Thumbnails sidebar
  thumbnailsSidebar: { ...PANEL_STYLES.dropdown, position: 'absolute', top: '50px', left: '12px', width: '200px', maxHeight: 'calc(100vh - 140px)' },
  thumbnailsGrid: { overflow: 'auto', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
  thumbnailItem: { background: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  thumbnailImg: { width: '100%', height: 'auto', borderRadius: '2px', display: 'block' },
  thumbnailPlaceholder: { width: '100%', aspectRatio: '0.7', backgroundColor: '#f0f0f0', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // Rendering
  renderingOverlay: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 },
  spinner: { width: '32px', height: '32px', border: '3px solid #e0e0e0', borderTopColor: '#2f95dc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  // Also map shortcutKey → kbd for PDF
  kbd: BASE_READER_STYLES.shortcutKey,
};
