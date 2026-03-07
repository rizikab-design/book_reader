import { useEffect, useState } from 'react';
import { StyleSheet, Platform } from 'react-native';

import { Text, View } from '@/components/Themed';
import { getAvailableVoices } from '@/lib/tts-engine';

const FAVORITES_KEY = 'tts-favorite-voices';
const PREFERRED_VOICE_KEY = 'tts-preferred-voice';

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavorites(names: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(names));
}

export default function SettingsScreen() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [preferredVoice, setPreferredVoice] = useState<string>('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setFavorites(loadFavorites());
    try {
      setPreferredVoice(localStorage.getItem(PREFERRED_VOICE_KEY) || '');
    } catch {}
    getAvailableVoices().then((allVoices) => {
      setVoices(allVoices.filter((v) => v.lang.startsWith('en')));
    });
  }, []);

  function changePreferredVoice(name: string) {
    setPreferredVoice(name);
    localStorage.setItem(PREFERRED_VOICE_KEY, name);
  }

  function toggleFavorite(name: string) {
    setFavorites((prev) => {
      const next = prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name];
      saveFavorites(next);
      return next;
    });
  }

  function previewVoiceAudio(voice: SpeechSynthesisVoice) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('Hello, this is a preview of my voice.');
    utterance.voice = voice;
    utterance.rate = 1;
    setPreviewVoice(voice.name);
    utterance.onend = () => setPreviewVoice(null);
    utterance.onerror = () => setPreviewVoice(null);
    window.speechSynthesis.speak(utterance);
  }

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Settings available on web version.</Text>
      </View>
    );
  }

  const favoriteVoices = voices.filter((v) => favorites.includes(v.name));
  const otherVoices = voices.filter((v) => !favorites.includes(v.name));

  return (
    <div style={webStyles.container}>
      <div style={webStyles.header}>
        <h1 style={webStyles.title}>Settings</h1>
      </div>

      <div style={webStyles.section}>
        <h2 style={webStyles.sectionTitle}>Preferred Voice</h2>
        <p style={webStyles.sectionDesc}>
          This voice will be used by default when reading aloud in the reader.
        </p>
        <select
          value={preferredVoice}
          onChange={(e) => changePreferredVoice(e.target.value)}
          style={webStyles.preferredSelect}
        >
          <option value="">System default</option>
          {favorites.length > 0 && voices.some((v) => favorites.includes(v.name)) && (
            <optgroup label="Favorites">
              {voices
                .filter((v) => favorites.includes(v.name))
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
            </optgroup>
          )}
          <optgroup label="All English voices">
            {voices
              .filter((v) => !favorites.includes(v.name))
              .map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      <div style={webStyles.section}>
        <h2 style={webStyles.sectionTitle}>Favorite Voices</h2>
        <p style={webStyles.sectionDesc}>
          Star voices to pin them to the top of the voice selector in the reader.
          Click the play button to preview a voice.
        </p>

        {favoriteVoices.length > 0 && (
          <div style={webStyles.voiceGroup}>
            <div style={webStyles.groupLabel}>Favorites</div>
            {favoriteVoices.map((v) => (
              <div key={v.name} style={webStyles.voiceRow}>
                <button
                  onClick={() => toggleFavorite(v.name)}
                  style={webStyles.starButton}
                  title="Remove from favorites"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
                <div style={webStyles.voiceInfo}>
                  <span style={webStyles.voiceName}>{v.name}</span>
                  <span style={webStyles.voiceLang}>{v.lang}</span>
                </div>
                <button
                  onClick={() => previewVoiceAudio(v)}
                  style={{
                    ...webStyles.previewButton,
                    color: previewVoice === v.name ? '#2f95dc' : '#999',
                  }}
                  title="Preview voice"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={webStyles.voiceGroup}>
          <div style={webStyles.groupLabel}>All English Voices ({otherVoices.length})</div>
          {otherVoices.map((v) => (
            <div key={v.name} style={webStyles.voiceRow}>
              <button
                onClick={() => toggleFavorite(v.name)}
                style={webStyles.starButton}
                title="Add to favorites"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <div style={webStyles.voiceInfo}>
                <span style={webStyles.voiceName}>{v.name}</span>
                <span style={webStyles.voiceLang}>{v.lang}</span>
              </div>
              <button
                onClick={() => previewVoiceAudio(v)}
                style={{
                  ...webStyles.previewButton,
                  color: previewVoice === v.name ? '#2f95dc' : '#999',
                }}
                title="Preview voice"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>
            </div>
          ))}
          {voices.length === 0 && (
            <p style={{ padding: '16px', color: '#999', fontSize: '13px' }}>
              No voices available. Try reloading the page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const webStyles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#333',
    margin: 0,
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#333',
    margin: '0 0 4px 0',
  },
  sectionDesc: {
    fontSize: '13px',
    color: '#999',
    margin: '0 0 16px 0',
    lineHeight: '1.4',
  },
  preferredSelect: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    appearance: 'auto' as const,
  },
  voiceGroup: {
    marginBottom: '20px',
    maxHeight: '400px',
    overflow: 'auto',
    border: '1px solid #eee',
    borderRadius: '8px',
  },
  groupLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
    marginBottom: '4px',
  },
  voiceRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 4px',
    borderBottom: '1px solid #f5f5f5',
    gap: '10px',
  },
  starButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  voiceInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  voiceName: {
    fontSize: '14px',
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  voiceLang: {
    fontSize: '11px',
    color: '#999',
  },
  previewButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
});
