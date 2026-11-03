import { z } from 'zod';

export const DEVIATION_PROJECT_FORMAT = 'emotion-system.deviation-id.project';
export const DEVIATION_PROJECT_VERSION = 2;
export const MAX_PROJECT_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 24 * 1024 * 1024;

const currentDeviationDraftSchema = z.object({
  cardName: z.string().trim().min(1).max(80),
  selfDefinition: z.string().trim().max(80),
  bio: z.string().trim().max(240),
  subjectId: z.string().trim().max(48),
  deviationLevel: z.number().int().min(1).max(100),
  crop: z.object({
    zoom: z.number().min(1).max(3),
    x: z.number().min(-1).max(1),
    y: z.number().min(-1).max(1),
  }),
  visualMode: z.enum(['ARCHIVE', 'GLITCH', 'SIGNAL', 'MONO']),
  animation: z.object({
    durationSeconds: z.number().int().min(5).max(30).transform(() => 5),
    glitchIntensity: z.number().int().min(0).max(100),
    particleDensity: z.number().int().min(0).max(100).default(72),
    blockCount: z.number().int().min(4).max(240).transform((count) => count > 9 ? 6 : count).default(6),
    blockSize: z.union([
      z.enum(['SMALL', 'MEDIUM', 'LARGE']),
      z.number().int().min(0).max(100),
    ]).transform((size) => typeof size === 'number'
      ? size < 34 ? 'SMALL' : size < 67 ? 'MEDIUM' : 'LARGE'
      : size).default('LARGE'),
    flickerSpeed: z.number().int().min(3).max(15).transform((speed) => speed > 8 ? 5 : speed).default(5),
    revealDensity: z.number().int().min(0).max(100).transform((density) => Math.min(85, Math.max(20, density))).default(75),
    fragmentDisplacement: z.number().int().min(0).max(100).default(30),
    particleSize: z.number().int().min(1).max(8).default(3),
    particleMotion: z.number().int().min(0).max(100).default(48),
    particleGlow: z.number().int().min(0).max(100).default(68),
    rgbSplit: z.number().int().min(0).max(100).default(30),
    flashIntensity: z.number().int().min(0).max(100).default(24),
    reconstructionSpeed: z.number().int().min(20).max(100).default(60),
  }),
  audio: z.object({
    includeTechCues: z.boolean(),
  }),
  output: z.object({
    resolution: z.enum(['720p', '1080p']),
    format: z.enum(['webm', 'mp4']),
  }),
});

export const deviationDraftSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const legacy = input as Record<string, unknown>;
  return {
    ...legacy,
    cardName: typeof legacy.cardName === 'string'
      ? legacy.cardName
      : typeof legacy.profileName === 'string' && legacy.profileName.trim()
        ? legacy.profileName
        : legacy.projectName,
    selfDefinition: typeof legacy.selfDefinition === 'string'
      ? legacy.selfDefinition
      : legacy.callsign,
    deviationLevel: typeof legacy.deviationLevel === 'number'
      ? Math.max(1, legacy.deviationLevel)
      : 1,
  };
}, currentDeviationDraftSchema);

export type DeviationDraft = z.infer<typeof deviationDraftSchema>;

export const portableProjectSchema = z.object({
  format: z.literal(DEVIATION_PROJECT_FORMAT),
  version: z.union([z.literal(1), z.literal(DEVIATION_PROJECT_VERSION)]),
  exportedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  draft: deviationDraftSchema,
  photoDataUrl: z.string()
    .max(34_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/i)
    .nullable(),
  thumbnailDataUrl: z.string()
    .max(2_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/i)
    .nullable(),
}).transform((project) => ({ ...project, version: DEVIATION_PROJECT_VERSION }));

export type PortableProject = z.infer<typeof portableProjectSchema>;

function randomHex(length: number) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
}

export function createProjectKey() {
  return globalThis.crypto.randomUUID?.() ?? `project-${randomHex(24)}`;
}

export function createDefaultDraft(): DeviationDraft {
  return {
    cardName: '',
    selfDefinition: '',
    bio: '',
    subjectId: '',
    deviationLevel: 42,
    crop: { zoom: 1, x: 0, y: 0 },
    visualMode: 'ARCHIVE',
    animation: {
      durationSeconds: 5,
      glitchIntensity: 48,
      particleDensity: 72,
      blockCount: 6,
      blockSize: 'LARGE',
      flickerSpeed: 5,
      revealDensity: 75,
      fragmentDisplacement: 30,
      particleSize: 3,
      particleMotion: 48,
      particleGlow: 68,
      rgbSplit: 30,
      flashIntensity: 18,
      reconstructionSpeed: 60,
    },
    audio: { includeTechCues: false },
    output: { resolution: '720p', format: 'webm' },
  };
}
