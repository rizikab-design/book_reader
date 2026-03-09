/**
 * Dictionary + Thesaurus API
 *
 * Uses Free Dictionary API for definitions and Datamuse API for synonyms/antonyms.
 * Both are free, no API key required.
 */

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  audio?: string;
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
  synonyms: string[];
  antonyms: string[];
}

interface FreeDictPhonetic {
  text?: string;
  audio?: string;
}

interface FreeDictDefinition {
  definition: string;
  example?: string;
}

interface FreeDictMeaning {
  partOfSpeech: string;
  definitions?: FreeDictDefinition[];
}

interface FreeDictResponse {
  phonetic?: string;
  phonetics?: FreeDictPhonetic[];
  meanings?: FreeDictMeaning[];
}

interface DatamuseWord {
  word: string;
}

export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const cleaned = word.trim().toLowerCase().replace(/[^a-z'-]/g, '');
  if (!cleaned || cleaned.length < 2) return null;

  const [dictRes, synRes, antRes] = await Promise.all([
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`).catch(() => null),
    fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleaned)}&max=12`).catch(() => null),
    fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleaned)}&max=8`).catch(() => null),
  ]);

  let meanings: DictionaryEntry['meanings'] = [];
  let phonetic: string | undefined;
  let audio: string | undefined;

  if (dictRes && dictRes.ok) {
    const data: FreeDictResponse[] = await dictRes.json();
    if (Array.isArray(data) && data.length > 0) {
      const entry = data[0];
      phonetic = entry.phonetic || entry.phonetics?.[0]?.text;
      audio = entry.phonetics?.find((p: FreeDictPhonetic) => p.audio)?.audio;
      meanings = (entry.meanings || []).map((m: FreeDictMeaning) => ({
        partOfSpeech: m.partOfSpeech,
        definitions: (m.definitions || []).slice(0, 3).map((d: FreeDictDefinition) => ({
          definition: d.definition,
          example: d.example,
        })),
      }));
    }
  }

  const synonyms: string[] = [];
  const antonyms: string[] = [];

  if (synRes && synRes.ok) {
    const data: DatamuseWord[] = await synRes.json();
    synonyms.push(...data.map((d: DatamuseWord) => d.word));
  }

  if (antRes && antRes.ok) {
    const data: DatamuseWord[] = await antRes.json();
    antonyms.push(...data.map((d: DatamuseWord) => d.word));
  }

  if (meanings.length === 0 && synonyms.length === 0 && antonyms.length === 0) {
    return null;
  }

  return { word: cleaned, phonetic, audio, meanings, synonyms, antonyms };
}
