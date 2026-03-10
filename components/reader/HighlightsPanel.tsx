/**
 * HighlightsPanel — Highlights & Notes dropdown panel
 *
 * Used by both ePub and PDF readers.
 */

import React from 'react';
import type { HighlightColor, ReaderHighlight } from '@/hooks/reader-types';

export interface HighlightsPanelHlState {
  highlights: ReaderHighlight[];
  showHighlights: boolean;
  setShowHighlights: (v: boolean) => void;
  editingHighlightId: number | null;
  setEditingHighlightId: (id: number | null) => void;
  editNoteText: string;
  setEditNoteText: (v: string) => void;
  isExportingDrive: boolean;
  startEditNote: (h: ReaderHighlight) => void;
  saveEditNote: () => void;
  removeHighlight: (id: number) => void;
  handleDriveExport: () => void;
  exportHighlightsAsText: () => void;
}

interface HighlightsPanelProps {
  hlState: HighlightsPanelHlState;
  themeColors: { bg: string; text: string };
  panelTheme: React.CSSProperties;
  panelBorder: string;
  /** Called when user clicks a highlight to navigate to it */
  onNavigate: (highlight: ReaderHighlight) => void;
  HIGHLIGHT_COLORS: Record<HighlightColor, string>;
  /** 'epub' uses color-bar left layout; 'pdf' uses border-left on text */
  variant?: 'epub' | 'pdf';
}

export default function HighlightsPanel({
  hlState,
  themeColors,
  panelTheme,
  panelBorder,
  onNavigate,
  HIGHLIGHT_COLORS,
  variant = 'epub',
}: HighlightsPanelProps) {
  return (
    <div className="reader-panel-dropdown" style={{ ...styles.highlightsDropdown, ...panelTheme }}>
      <div style={styles.dropdownHeader}>
        <strong>Highlights & Notes</strong>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {hlState.highlights.length > 0 && (
            <>
              <button
                onClick={hlState.handleDriveExport}
                disabled={hlState.isExportingDrive}
                style={{ ...styles.iconButtonSmall, opacity: hlState.isExportingDrive ? 0.4 : 1 }}
                title="Export Cornell Notes to Google Drive"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </button>
              <button
                onClick={hlState.exportHighlightsAsText}
                style={styles.iconButtonSmall}
                title="Export highlights as text file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={() => hlState.setShowHighlights(false)}
            style={styles.iconButtonSmall}
          >
            {'\u2715'}
          </button>
        </div>
      </div>
      {hlState.highlights.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Highlights or Notes</div>
          <div style={{ fontSize: '12px', opacity: 0.6 }}>
            {variant === 'pdf'
              ? 'Select text to highlight or add notes.'
              : 'Select text, then choose a color or click Add Note.'}
          </div>
        </div>
      ) : (
        <div style={styles.highlightsList}>
          {hlState.highlights.map((h) => (
            variant === 'epub' ? (
              <div key={h.id} style={styles.highlightDropdownItemEpub}>
                {/* Color bar */}
                <div
                  style={{
                    width: '4px',
                    alignSelf: 'stretch',
                    backgroundColor: HIGHLIGHT_COLORS[h.color],
                    borderRadius: '2px',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Clickable text to navigate */}
                  <button
                    onClick={() => onNavigate(h)}
                    style={styles.highlightTextButton}
                  >
                    "{h.selectedText.length > 80
                      ? h.selectedText.slice(0, 80) + '...'
                      : h.selectedText}"
                  </button>

                  {/* Note editing */}
                  {hlState.editingHighlightId === h.id ? (
                    <div style={{ padding: '0 12px 8px 12px' }}>
                      <textarea
                        value={hlState.editNoteText}
                        onChange={(e) => hlState.setEditNoteText(e.target.value)}
                        style={styles.noteInput}
                        rows={2}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          onClick={() => hlState.setEditingHighlightId(null)}
                          style={styles.popupButtonCancel}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={hlState.saveEditNote}
                          style={styles.popupButtonSave}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0 12px 8px 12px' }}>
                      {h.note && (
                        <div style={{
                          fontSize: '12px',
                          color: '#555',
                          fontStyle: 'italic',
                          marginBottom: '4px',
                        }}>
                          {h.note}
                        </div>
                      )}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        opacity: 0.4,
                      }}>
                        <span>{h.pageInfo}</span>
                        <span>{'\u00B7'}</span>
                        <button
                          onClick={() => hlState.startEditNote(h)}
                          style={styles.sidebarAction}
                        >
                          {h.note ? 'Edit note' : 'Add note'}
                        </button>
                        <button
                          onClick={() => hlState.removeHighlight(h.id)}
                          style={styles.sidebarAction}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={h.id} style={{ borderBottom: `1px solid ${panelBorder}` }}>
                <button
                  onClick={() => onNavigate(h)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px 4px 12px', fontSize: '13px', color: themeColors.text, cursor: 'pointer', lineHeight: '1.4' }}
                >
                  <span style={{ borderLeft: `3px solid ${HIGHLIGHT_COLORS[h.color]}`, paddingLeft: '8px', display: 'block' }}>
                    "{h.selectedText.length > 80 ? h.selectedText.slice(0, 80) + '...' : h.selectedText}"
                  </span>
                </button>
                {h.note && <div style={{ padding: '2px 12px 2px 23px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>{h.note}</div>}
                <div style={{ display: 'flex', gap: '8px', padding: '4px 12px 8px 23px', fontSize: '11px', color: '#999' }}>
                  <span>{h.pageInfo}</span>
                  <span>{h.createdAt}</span>
                  {hlState.editingHighlightId === h.id ? (
                    <span style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        value={hlState.editNoteText}
                        onChange={(e) => hlState.setEditNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') hlState.saveEditNote(); }}
                        style={{ width: '120px', fontSize: '11px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '3px' }}
                        autoFocus
                      />
                    </span>
                  ) : (
                    <>
                      <button onClick={() => hlState.startEditNote(h)} style={{ ...styles.actionBtn, color: '#2f95dc' }}>Edit</button>
                      <button onClick={() => hlState.removeHighlight(h.id)} style={{ ...styles.actionBtn, color: '#e55' }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  highlightsDropdown: {
    position: 'absolute',
    top: '44px',
    left: '12px',
    width: '300px',
    maxHeight: '500px',
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
  emptyState: {
    padding: '30px 20px',
    textAlign: 'center',
    color: '#999',
    fontSize: '13px',
  },
  highlightsList: {
    flex: 1,
    overflow: 'auto',
  },
  highlightDropdownItemEpub: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },
  highlightTextButton: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: '10px 12px 4px 12px',
    fontSize: '13px',
    color: '#333',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  noteInput: {
    width: '100%',
    padding: '8px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  popupButtonCancel: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    color: '#666',
  },
  popupButtonSave: {
    background: '#2f95dc',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    color: '#fff',
  },
  sidebarAction: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#2f95dc',
    padding: 0,
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    padding: 0,
  },
  iconButtonSmall: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#999',
  },
};
