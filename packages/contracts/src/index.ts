import { z } from "zod";

export const sourceSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  version: z.string().optional(),
  url: z.string().optional(),
  enabled: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  installedAt: z.string().optional(),
});

export const comicSchema = z.object({
  sourceKey: z.string().optional(),
  id: z.string(),
  title: z.string(),
  cover: z.string().optional(),
  subtitle: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  stars: z.number().optional(),
});

export const comicDetailsSchema = comicSchema.extend({
  chapters: z.record(z.string()).optional(),
  thumbnails: z.array(z.string()).optional(),
  recommendations: z.array(comicSchema).optional(),
});

export const episodePagesSchema = z.object({
  sourceKey: z.string(),
  comicId: z.string(),
  episodeId: z.string(),
  images: z.array(z.string()),
});

export const downloadTaskSchema = z.object({
  id: z.string(),
  sourceKey: z.string(),
  comicId: z.string(),
  episodeId: z.string().optional(),
  status: z.string(),
  progress: z.number(),
  error: z.string().optional(),
  outputPath: z.string().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type SourceSummary = z.infer<typeof sourceSummarySchema>;
export type Comic = z.infer<typeof comicSchema>;
export type ComicDetails = z.infer<typeof comicDetailsSchema>;
export type EpisodePages = z.infer<typeof episodePagesSchema>;
export type DownloadTask = z.infer<typeof downloadTaskSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
