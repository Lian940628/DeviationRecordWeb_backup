import {
  DEVIATION_PROJECT_FORMAT,
  DEVIATION_PROJECT_VERSION,
  MAX_PHOTO_BYTES,
  MAX_PROJECT_FILE_BYTES,
  deviationDraftSchema,
  portableProjectSchema,
  type DeviationDraft,
} from './types';

const DATABASE_NAME = 'emotion-system-deviation-id';
const DATABASE_VERSION = 2;
const PROJECTS_STORE = 'projects';
const ASSETS_STORE = 'assets';
const META_STORE = 'metadata';

export interface StoredProjectSummary {
  id: string;
  draft: DeviationDraft;
  createdAt: number;
  updatedAt: number;
  thumbnailBlob: Blob | null;
}

export interface StoredProject extends StoredProjectSummary {
  photoBlob: Blob | null;
}

interface StoredAssets {
  id: string;
  photoBlob: Blob | null;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open the local project archive.'));
    request.onblocked = () => reject(new Error('Close other EMOTION / SYSTEM tabs to update the local project archive.'));
  });
}

function transactionPromise<T>(
  database: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  start: (transaction: IDBTransaction) => T,
) {
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let settled = false;
    const transaction = database.transaction(stores, mode);
    try {
      result = start(transaction);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('The local project operation failed.'));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('The local project operation was cancelled.'));
    };
  });
}

export async function getNextLocalSubjectId() {
  const database = await openDatabase();
  return new Promise<string>((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE, META_STORE], 'readwrite');
    const projectsRequest = transaction.objectStore(PROJECTS_STORE).getAll();
    const sequenceRequest = transaction.objectStore(META_STORE).get('subject-sequence');
    let nextId = '';
    let settled = false;
    let projects: Array<{ draft?: { subjectId?: string } }> = [];
    let storedMaximum = 0;
    let projectsLoaded = false;
    let sequenceLoaded = false;

    const writeNextSequence = () => {
      if (!projectsLoaded || !sequenceLoaded) return;
      const existingMaximum = projects.reduce((maximum, project) => {
        const match = project.draft?.subjectId?.match(/^DR-(\d{1,12})$/i);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
      }, 0);
      const next = Math.max(existingMaximum, storedMaximum) + 1;
      transaction.objectStore(META_STORE).put({ key: 'subject-sequence', value: next });
      nextId = `DR-${String(next).padStart(6, '0')}`;
    };

    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not allocate a local subject number.'));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not allocate a local subject number.'));
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(nextId);
    };
    projectsRequest.onsuccess = () => {
      projects = (projectsRequest.result as Array<{ draft?: { subjectId?: string } }>) ?? [];
      projectsLoaded = true;
      writeNextSequence();
    };
    sequenceRequest.onsuccess = () => {
      storedMaximum = Number((sequenceRequest.result as { value?: unknown } | undefined)?.value) || 0;
      sequenceLoaded = true;
      writeNextSequence();
    };
  });
}

export async function listProjects(): Promise<StoredProjectSummary[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE], 'readonly');
    const request = transaction.objectStore(PROJECTS_STORE).getAll();
    let projects: StoredProjectSummary[] = [];
    let settled = false;
    request.onsuccess = () => {
       projects = (request.result as StoredProjectSummary[])
        .map((project) => ({
          ...project,
          draft: deviationDraftSchema.parse(project.draft),
        }))
        .sort((left, right) => right.updatedAt - left.updatedAt);
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(projects);
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not read the local project archive.'));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not read the local project archive.'));
    };
  });
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE, ASSETS_STORE], 'readonly');
    const projectRequest = transaction.objectStore(PROJECTS_STORE).get(id);
    const assetsRequest = transaction.objectStore(ASSETS_STORE).get(id);
    let project: StoredProjectSummary | undefined;
    let assets: StoredAssets | undefined;
    let settled = false;

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      try {
        resolve(project
          ? {
            ...project,
            draft: deviationDraftSchema.parse(project.draft),
            photoBlob: assets?.photoBlob ?? null,
          }
          : null);
      } catch (error) {
        reject(error);
      }
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not load this local project.'));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error ?? new Error('Could not load this local project.'));
    };
    projectRequest.onsuccess = () => { project = projectRequest.result as StoredProjectSummary | undefined; };
    assetsRequest.onsuccess = () => { assets = assetsRequest.result as StoredAssets | undefined; };
  });
}

export async function saveProject(project: StoredProject) {
  const database = await openDatabase();
  return transactionPromise(database, [PROJECTS_STORE, ASSETS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(PROJECTS_STORE).put({
      id: project.id,
      draft: deviationDraftSchema.parse(project.draft),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      thumbnailBlob: project.thumbnailBlob,
    } satisfies StoredProjectSummary);
    const assetsStore = transaction.objectStore(ASSETS_STORE);
    if (project.photoBlob) assetsStore.put({ id: project.id, photoBlob: project.photoBlob } satisfies StoredAssets);
    else assetsStore.delete(project.id);
    return undefined;
  });
}

export async function deleteProject(id: string) {
  const database = await openDatabase();
  return transactionPromise(database, [PROJECTS_STORE, ASSETS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(PROJECTS_STORE).delete(id);
    transaction.objectStore(ASSETS_STORE).delete(id);
    return undefined;
  });
}

export async function deleteAllProjects() {
  const database = await openDatabase();
  return transactionPromise(database, [PROJECTS_STORE, ASSETS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(PROJECTS_STORE).clear();
    transaction.objectStore(ASSETS_STORE).clear();
    return undefined;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not prepare the project image for export.'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the project image.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string | null) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z\d+/=]+)$/i);
  if (!match) throw new Error('The project image format is invalid.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

export async function exportProjectFile(
  draft: DeviationDraft,
  photoBlob: Blob | null,
  thumbnailBlob: Blob | null,
  createdAt: number,
) {
  const parsedDraft = deviationDraftSchema.parse(draft);
  if (photoBlob && photoBlob.size > MAX_PHOTO_BYTES) {
    throw new Error('Photos must be 24 MB or smaller for a portable project.');
  }
  const payload = {
    format: DEVIATION_PROJECT_FORMAT,
    version: DEVIATION_PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    createdAt: new Date(createdAt).toISOString(),
    draft: parsedDraft,
    photoDataUrl: photoBlob ? await blobToDataUrl(photoBlob) : null,
    thumbnailDataUrl: thumbnailBlob ? await blobToDataUrl(thumbnailBlob) : null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('This project file is larger than 40 MB. Reduce the photo size before exporting.');
  }
  return blob;
}

export async function importProjectFile(file: File) {
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Project files must be 40 MB or smaller.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not valid project JSON.');
  }

  const parsed = portableProjectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('This project file is invalid or uses an unsupported version.');
  }
  const { photoDataUrl, thumbnailDataUrl, ...metadata } = parsed.data;
  const photoBlob = dataUrlToBlob(photoDataUrl);
  if (photoBlob && photoBlob.size > MAX_PHOTO_BYTES) {
    throw new Error('The imported photo is larger than the 24 MB project limit.');
  }
  return {
    ...metadata,
    photoBlob,
    thumbnailBlob: dataUrlToBlob(thumbnailDataUrl),
  };
}
