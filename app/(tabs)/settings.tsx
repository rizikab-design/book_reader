import { useEffect, useState } from 'react';
import { StyleSheet, Platform } from 'react-native';

import { Text, View } from '@/components/Themed';
import { getAvailableVoices, getTTSMode, setTTSMode, getNeuralVoice, setNeuralVoice, getNeuralVoices, type TTSMode, type NeuralVoiceInfo } from '@/lib/tts-engine';
import { getGoogleClientId, setGoogleClientId } from '@/lib/google-drive';
import { API_BASE } from '@/lib/config';

const FAVORITES_KEY = 'tts-favorite-voices';
const PREFERRED_VOICE_KEY = 'tts-preferred-voice';

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Failed to load favorite voices from localStorage:', e);
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
  const [googleClientId, setGoogleClientIdState] = useState<string>('');
  const [ttsMode, setTtsModeState] = useState<TTSMode>('browser');
  const [neuralVoices, setNeuralVoices] = useState<NeuralVoiceInfo[]>([]);
  const [neuralVoice, setNeuralVoiceState] = useState<string>('en-US-AriaNeural');
  const [neuralPreview, setNeuralPreview] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setFavorites(loadFavorites());
    setGoogleClientIdState(getGoogleClientId());
    setTtsModeState(getTTSMode());
    setNeuralVoiceState(getNeuralVoice());
    try {
      setPreferredVoice(localStorage.getItem(PREFERRED_VOICE_KEY) || '');
    } catch (e) { console.warn('Failed to load preferred voice setting:', e); }
    getAvailableVoices().then((allVoices) => {
      setVoices(allVoices.filter((v) => v.lang.startsWith('en')));
    });
    getNeuralVoices().then(setNeuralVoices).catch(() => {});
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

  async function previewNeuralVoice(voiceId: string) {
    setNeuralPreview(voiceId);
    try {
      const res = await fetch(`${API_BASE}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, this is a preview of my voice.', voice: voiceId, rate: 1 }),
      });
      if (!res.ok) { setNeuralPreview(null); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { setNeuralPreview(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setNeuralPreview(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setNeuralPreview(null);
    }
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
        <h2 style={webStyles.sectionTitle}>Google Drive Export</h2>
        <p style={webStyles.sectionDesc}>
          Export your highlights and notes to Google Drive in Cornell note format.
          To set up, create a Google Cloud project and OAuth 2.0 Client ID.
        </p>
        <details style={{ fontSize: '13px', color: '#666', marginBottom: '12px', lineHeight: '1.6' }}>
          <summary style={{ cursor: 'pointer', color: '#2f95dc', fontWeight: 500 }}>Setup instructions</summary>
          <ol style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2f95dc' }}>Google Cloud Console</a></li>
            <li>Create a new project (or use an existing one)</li>
            <li>Go to "APIs &amp; Services" &rarr; "Library" and enable <strong>Google Drive API</strong></li>
            <li>Go to "APIs &amp; Services" &rarr; "Credentials"</li>
            <li>Click "Create Credentials" &rarr; "OAuth 2.0 Client ID"</li>
            <li>Choose "Web application" as application type</li>
            <li>Under "Authorized JavaScript Origins", add: <code>http://localhost:8081</code></li>
            <li>Copy the Client ID and paste it below</li>
          </ol>
        </details>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={googleClientId}
            onChange={(e) => {
              setGoogleClientIdState(e.target.value);
              setGoogleClientId(e.target.value);
            }}
            placeholder="Paste your Google Client ID here"
            style={{ ...webStyles.preferredSelect, flex: 1 }}
          />
          {googleClientId && <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 500 }}>Configured</span>}
        </div>
      </div>

      <div style={webStyles.section}>
        <h2 style={webStyles.sectionTitle}>Voice Engine</h2>
        <p style={webStyles.sectionDesc}>
          Choose between your device's built-in voices or high-quality neural voices (requires server).
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => { setTtsModeState('browser'); setTTSMode('browser'); }}
            style={{
              ...webStyles.preferredSelect,
              flex: 1,
              textAlign: 'center',
              cursor: 'pointer',
              fontWeight: ttsMode === 'browser' ? 700 : 400,
              background: ttsMode === 'browser' ? '#2f95dc' : '#fff',
              color: ttsMode === 'browser' ? '#fff' : '#333',
              border: ttsMode === 'browser' ? '2px solid #2f95dc' : '1px solid #ddd',
            }}
          >
            Browser Voices
          </button>
          <button
            onClick={() => { setTtsModeState('neural'); setTTSMode('neural'); }}
            style={{
              ...webStyles.preferredSelect,
              flex: 1,
              textAlign: 'center',
              cursor: 'pointer',
              fontWeight: ttsMode === 'neural' ? 700 : 400,
              background: ttsMode === 'neural' ? '#2f95dc' : '#fff',
              color: ttsMode === 'neural' ? '#fff' : '#333',
              border: ttsMode === 'neural' ? '2px solid #2f95dc' : '1px solid #ddd',
            }}
          >
            Neural Voices
          </button>
        </div>

        {ttsMode === 'neural' && (
          <>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#333', margin: '0 0 8px 0' }}>Neural Voice</h3>
            <select
              value={neuralVoice}
              onChange={(e) => { setNeuralVoiceState(e.target.value); setNeuralVoice(e.target.value); }}
              style={{ ...webStyles.preferredSelect, marginBottom: '12px' }}
            >
              {neuralVoices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
              {neuralVoices.length === 0 && <option value="">Loading voices...</option>}
            </select>

            <div style={webStyles.voiceGroup}>
              <div style={webStyles.groupLabel}>Preview Neural Voices ({neuralVoices.length})</div>
              {neuralVoices.map((v) => (
                <div key={v.id} style={webStyles.voiceRow}>
                  <div style={webStyles.voiceInfo}>
                    <span style={webStyles.voiceName}>{v.name.replace('Microsoft ', '').replace(' Online (Natural)', '')}</span>
                    <span style={webStyles.voiceLang}>{v.locale} · {v.gender}</span>
                  </div>
                  <button
                    onClick={() => previewNeuralVoice(v.id)}
                    style={{
                      ...webStyles.previewButton,
                      color: neuralPreview === v.id ? '#2f95dc' : '#999',
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
          </>
        )}
      </div>

      <div style={webStyles.section}>
        <h2 style={webStyles.sectionTitle}>Preferred Browser Voice</h2>
        <p style={webStyles.sectionDesc}>
          This voice will be used when "Browser Voices" mode is selected.
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
