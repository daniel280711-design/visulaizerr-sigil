/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Google Drive API Client for Sigil Viz
 * Provides search, listing, streaming, and preset backup directly from/to Google Drive
 */

import { getAccessToken } from './firebase.ts';

export interface DriveAudioFile {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  modifiedTime?: string;
}

/**
 * Searches and lists audio files from Google Drive
 */
export async function listDriveAudioFiles(searchTerm = ''): Promise<{ files: DriveAudioFile[]; nextPageToken?: string }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No has iniciado sesión con Google Drive');
  }

  // Audio mimeTypes and popular audio extensions
  let q = "(mimeType contains 'audio/' or name contains '.mp3' or name contains '.wav' or name contains '.flac' or name contains '.ogg' or name contains '.m4a') and trashed = false";
  if (searchTerm.trim()) {
    const escaped = searchTerm.replace(/'/g, "\\'");
    q += ` and name contains '${escaped}'`;
  }

  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken, files(id, name, size, mimeType, modifiedTime)',
    pageSize: '40',
    orderBy: 'modifiedTime desc'
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Error al consultar Google Drive (${res.status})`);
  }

  const data = await res.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken
  };
}

/**
 * Downloads binary audio buffer from Google Drive for Web Audio API decoding
 */
export async function fetchDriveAudioBuffer(fileId: string, onProgress?: (pct: number) => void): Promise<ArrayBuffer> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No has iniciado sesión con Google Drive');
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al descargar audio de Google Drive (${res.status})`);
  }

  const contentLength = Number(res.headers.get('content-length'));
  if (!contentLength || !res.body) {
    return await res.arrayBuffer();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    if (onProgress && contentLength > 0) {
      onProgress(Math.min(1, receivedBytes / contentLength));
    }
  }

  const combined = new Uint8Array(receivedBytes);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }

  return combined.buffer;
}

/**
 * Exports a visualizer preset file to Google Drive.
 * Includes user confirmation check as strictly mandated by Workspace Skill guidelines.
 */
export async function savePresetToDrive(name: string, presetData: any): Promise<{ id: string; name: string }> {
  // Confirmation dialog mandated by Google Workspace guidelines
  const confirmed = window.confirm(
    `¿Deseas exportar el preset "${name}" a tu Google Drive como archivo JSON de configuración?`
  );
  if (!confirmed) {
    throw new Error('Operación cancelada por el usuario');
  }

  const token = getAccessToken();
  if (!token) {
    throw new Error('No has iniciado sesión con Google Drive');
  }

  const fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.sigil.json`;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'Sigil Viz Audio Visualizer Preset'
  };

  const fileContent = JSON.stringify(presetData, null, 2);

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al guardar preset en Drive (${res.status})`);
  }

  const data = await res.json();
  return { id: data.id, name: data.name };
}
