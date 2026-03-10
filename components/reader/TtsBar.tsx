import React from 'react';
import type { useReaderTts } from '@/hooks/useReaderTts';

interface TtsBarProps {
  tts: ReturnType<typeof useReaderTts>;
  activeTheme: string;
  themeColors: { bg: string; text: string };
  barsVisible: boolean;
}

const ttsStyles: Record<string, React.CSSProperties> = {
  ttsBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '8px 16px', borderTop: '1px solid #eee' },
  ttsButton: { background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '6px 12px', color: '#555' },
  speedDisplay: { background: 'none', border: '1px solid transparent', fontSize: '12px', color: '#555', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', minWidth: '36px', textAlign: 'center' },
  speedInput: { width: '44px', padding: '3px 6px', fontSize: '12px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' },
  speedSlider: { width: '80px', cursor: 'pointer', accentColor: '#2f95dc' },
  voiceSelect: { padding: '4px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fff', color: '#555', maxWidth: '200px', cursor: 'pointer' },
};

export default function TtsBar({ tts, activeTheme, themeColors, barsVisible }: TtsBarProps) {
  return (
    <div className="reader-ttsbar" style={{
      ...ttsStyles.ttsBar,
      backgroundColor: themeColors.bg,
      borderTopColor: activeTheme === 'quiet' ? '#555' : '#eee',
      opacity: barsVisible ? 1 : 0,
      transition: 'opacity 0.3s',
      pointerEvents: barsVisible ? 'auto' as const : 'none' as const,
    }}>
      <button onClick={tts.handleStop} style={ttsStyles.ttsButton}>
        {'\u25A0'}
      </button>
      <button
        onClick={tts.handlePlayPause}
        style={{
          ...ttsStyles.ttsButton,
          backgroundColor: tts.isPlaying ? '#333' : '#2f95dc',
          color: '#fff',
          padding: '6px 20px',
          borderRadius: '16px',
        }}
      >
        {tts.isPlaying ? '\u23F8' : '\u25B6'}
      </button>
      {tts.isEditingSpeed ? (
        <input
          type="text"
          value={tts.speedInput}
          onChange={(e) => tts.setSpeedInput(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') tts.handleSpeedInputSubmit();
            if (e.key === 'Escape') { tts.setIsEditingSpeed(false); tts.setSpeedInput(''); }
          }}
          onBlur={tts.handleSpeedInputSubmit}
          placeholder={String(tts.ttsSpeed)}
          autoFocus
          style={ttsStyles.speedInput}
        />
      ) : (
        <button
          onClick={() => { tts.setIsEditingSpeed(true); tts.setSpeedInput(''); }}
          style={ttsStyles.speedDisplay}
          title="Click to type a speed (0.5-3)"
        >
          {tts.ttsSpeed}x
        </button>
      )}
      <input
        type="range"
        min="0.5"
        max="3"
        step="0.25"
        value={tts.ttsSpeed}
        onChange={(e) => tts.handleSpeedChange(parseFloat(e.target.value))}
        style={ttsStyles.speedSlider}
      />
      {tts.availableVoices.length > 0 && (
        <select
          value={tts.selectedVoiceId}
          onChange={(e) => tts.selectVoice(e.target.value)}
          style={ttsStyles.voiceSelect}
        >
          <option value="">Default voice</option>
          {tts.ttsMode === 'browser' && tts.favoriteVoiceNames.length > 0 && tts.availableVoices.some((v) => tts.favoriteVoiceNames.includes(v.name)) && (
            <optgroup label="Favorites">
              {tts.availableVoices
                .filter((v) => tts.favoriteVoiceNames.includes(v.name))
                .map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>
                ))}
            </optgroup>
          )}
          <optgroup label={tts.ttsMode === 'neural' ? 'Neural voices' : 'All voices'}>
            {tts.availableVoices
              .filter((v) => tts.ttsMode === 'neural' || !tts.favoriteVoiceNames.includes(v.name))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {tts.ttsMode === 'neural' ? v.name.replace('Microsoft ', '').replace(' Online (Natural)', '') : v.name} ({v.lang})
                </option>
              ))}
          </optgroup>
        </select>
      )}
    </div>
  );
}
