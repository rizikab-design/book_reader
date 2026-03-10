import { lookupWord, type DictionaryEntry } from '../dictionary';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('lookupWord', () => {
  test('returns structured DictionaryEntry for a valid word', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse([
          {
            phonetic: '/həˈloʊ/',
            phonetics: [{ text: '/həˈloʊ/', audio: 'https://example.com/hello.mp3' }],
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'A greeting', example: 'She said hello.' }],
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([{ word: 'hi' }, { word: 'greetings' }]))
      .mockResolvedValueOnce(jsonResponse([{ word: 'goodbye' }]));

    const result = await lookupWord('hello');

    expect(result).not.toBeNull();
    const entry = result as DictionaryEntry;
    expect(entry.word).toBe('hello');
    expect(entry.phonetic).toBe('/həˈloʊ/');
    expect(entry.audio).toBe('https://example.com/hello.mp3');
    expect(entry.meanings).toHaveLength(1);
    expect(entry.meanings[0].partOfSpeech).toBe('noun');
    expect(entry.synonyms).toEqual(['hi', 'greetings']);
    expect(entry.antonyms).toEqual(['goodbye']);
  });

  test('cleans special characters from input', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse([
          {
            meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'test' }] }],
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    await lookupWord('  Hello! ');

    // Should have fetched with cleaned word "hello"
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const dictUrl = mockFetch.mock.calls[0][0] as string;
    expect(dictUrl).toContain('/hello');
    expect(dictUrl).not.toContain('!');
  });

  test('returns null when word is too short (< 2 chars)', async () => {
    const result = await lookupWord('a');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns null for empty/whitespace input', async () => {
    expect(await lookupWord('')).toBeNull();
    expect(await lookupWord('   ')).toBeNull();
    expect(await lookupWord('!!!')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('handles API failures gracefully (returns null, does not throw)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await lookupWord('hello');
    // All three fetches fail via .catch(() => null), so all responses are null
    // meanings, synonyms, antonyms all empty → returns null
    expect(result).toBeNull();
  });

  test('handles non-ok API responses', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, false)) // dict 404
      .mockResolvedValueOnce(jsonResponse([], false)) // syn fail
      .mockResolvedValueOnce(jsonResponse([], false)); // ant fail

    const result = await lookupWord('xyznonword');
    expect(result).toBeNull();
  });
});
