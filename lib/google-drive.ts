/**
 * Google Drive Export — Cornell Notes Format
 *
 * Uses Google Identity Services for OAuth2 and Drive API for file creation.
 * Exports highlights/notes as a Google Doc in Cornell note-taking format.
 *
 * Setup required:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or use existing)
 * 3. Enable "Google Drive API"
 * 4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
 * 5. Add http://localhost:8081 (and any other origins) to Authorized JavaScript Origins
 * 6. Copy the Client ID and paste it in Settings
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// ── Token cache ──────────────────────────────────────────────────────
let cachedToken: string | null = null;
let cachedTokenExpiry = 0;
const TOKEN_LIFETIME_MS = 3600 * 1000; // Google tokens last 1 hour

export function clearTokenCache() {
  cachedToken = null;
  cachedTokenExpiry = 0;
}

export function getGoogleClientId(): string {
  return localStorage.getItem('google-drive-client-id') || '';
}

export function setGoogleClientId(id: string) {
  localStorage.setItem('google-drive-client-id', id.trim());
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Google script`));
    document.head.appendChild(script);
  });
}

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('Google Client ID not set. Go to Settings to configure Google Drive.');
  }

  await loadScript('https://accounts.google.com/gsi/client');

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services failed to load'));
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: { error?: string; error_description?: string; access_token: string }) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        cachedToken = response.access_token;
        cachedTokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function findOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.status === 401) { clearTokenCache(); throw new Error('Google token expired. Please try again.'); }
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await createRes.json();
  return folder.id;
}

export interface ExportHighlight {
  selectedText: string;
  note: string;
  color: string;
  pageInfo: string;
  createdAt: string;
}

export async function exportCornellNotes(
  accessToken: string,
  bookTitle: string,
  highlights: ExportHighlight[]
): Promise<string> {
  const folderId = await findOrCreateFolder(accessToken, 'Book Reader Notes');
  const now = new Date().toLocaleDateString();

  const rows = highlights.map((h) => `
    <tr>
      <td style="width:30%;padding:12px;vertical-align:top;border:1px solid #ccc;background-color:#f9f9f9;">
        <strong style="font-size:11px;color:#555;text-transform:uppercase;">Key Concept</strong><br>
        <em>${esc(h.selectedText.length > 120 ? h.selectedText.slice(0, 120) + '...' : h.selectedText)}</em>
        <br><br>
        <span style="font-size:10px;color:#888;">Page: ${esc(h.pageInfo)} | ${esc(h.createdAt)}</span>
      </td>
      <td style="width:70%;padding:12px;vertical-align:top;border:1px solid #ccc;">
        <strong>Highlight:</strong> "${esc(h.selectedText)}"
        ${h.note ? `<br><br><strong>Notes:</strong> ${esc(h.note)}` : '<br><br><em style="color:#999;">No notes added</em>'}
      </td>
    </tr>`).join('\n');

  const html = `<html><body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;">
    <h1 style="border-bottom:3px solid #2f95dc;padding-bottom:8px;">Cornell Notes: ${esc(bookTitle)}</h1>
    <p style="color:#666;">Exported on ${now} &middot; ${highlights.length} highlight${highlights.length === 1 ? '' : 's'}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr style="background-color:#2f95dc;color:white;">
          <th style="padding:10px;text-align:left;width:30%;border:1px solid #2f95dc;">Cue / Key Terms</th>
          <th style="padding:10px;text-align:left;width:70%;border:1px solid #2f95dc;">Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="border:2px solid #2f95dc;border-radius:8px;padding:16px;margin-top:20px;background-color:#f0f8ff;">
      <h3 style="margin-top:0;color:#2f95dc;">Summary</h3>
      <p style="color:#666;font-style:italic;">Write your summary of the key concepts here...</p>
      <br><br><br>
    </div>
  </body></html>`;

  const metadata = {
    name: `Cornell Notes - ${bookTitle}`,
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  };

  const boundary = '---boundary' + Date.now();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html',
    '',
    html,
    `--${boundary}--`,
  ].join('\r\n');

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (uploadRes.status === 401) { clearTokenCache(); throw new Error('Google token expired. Please try again.'); }
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const result = await uploadRes.json();
  return result.webViewLink || `https://docs.google.com/document/d/${result.id}`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
