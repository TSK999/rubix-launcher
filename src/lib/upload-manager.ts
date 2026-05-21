import { supabase } from "@/integrations/supabase/client";
import { extractThumbnail, type SharedClip, type Visibility } from "@/lib/clip-share";

export type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "processing"
  | "ready"
  | "error"
  | "canceled";

export type UploadJob = {
  id: string;
  fileName: string;
  fileSize: number;
  title: string;
  gameKey: string | null;
  gameTitle: string | null;
  visibility: Visibility;
  progress: number; // 0..1
  status: UploadStatus;
  error?: string;
  clipId?: string;
  slug?: string;
  startedAt: number;
};

type Listener = () => void;

class UploadStore {
  jobs: UploadJob[] = [];
  private listeners = new Set<Listener>();
  private blobs = new Map<string, Blob>();
  private xhrs = new Map<string, XMLHttpRequest>();
  private canceled = new Set<string>();

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  private patch(id: string, p: Partial<UploadJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
    this.emit();
  }
  remove(id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.blobs.delete(id);
    this.xhrs.delete(id);
    this.canceled.delete(id);
    this.emit();
  }
  clearCompleted() {
    const keep = this.jobs.filter((j) => !["ready", "canceled", "error"].includes(j.status));
    this.jobs = keep;
    this.emit();
  }
  cancel(id: string) {
    this.canceled.add(id);
    const xhr = this.xhrs.get(id);
    if (xhr) try { xhr.abort(); } catch {}
    this.patch(id, { status: "canceled", error: "Canceled" });
  }

  enqueue(input: {
    blob: Blob;
    fileName: string;
    title: string;
    gameKey: string | null;
    gameTitle: string | null;
    visibility?: Visibility;
  }): UploadJob {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: UploadJob = {
      id,
      fileName: input.fileName,
      fileSize: input.blob.size,
      title: input.title || input.fileName,
      gameKey: input.gameKey,
      gameTitle: input.gameTitle,
      visibility: input.visibility ?? "unlisted",
      progress: 0,
      status: "queued",
      startedAt: Date.now(),
    };
    this.jobs = [job, ...this.jobs];
    this.blobs.set(id, input.blob);
    this.emit();
    void this.run(id);
    return job;
  }

  retry(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    this.canceled.delete(id);
    this.patch(id, { status: "queued", progress: 0, error: undefined });
    void this.run(id);
  }

  private async run(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    const blob = this.blobs.get(id);
    if (!job || !blob) return;

    try {
      this.patch(id, { status: "preparing" });
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      // 1. Create shared_clips row (status=pending) — get slug + id
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
      const mime = blob.type || "video/webm";

      const meta = await safeReadVideoMeta(blob);

      const { data: inserted, error: insErr } = await supabase
        .from("shared_clips")
        .insert({
          user_id: user.id,
          title: job.title,
          game_key: job.gameKey,
          game_title: job.gameTitle,
          visibility: job.visibility,
          processing_status: "pending",
          mime_type: mime,
          size_bytes: blob.size,
          duration_seconds: meta.duration || null,
          width: meta.width || null,
          height: meta.height || null,
        })
        .select("*")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Insert failed");
      const clip = inserted as SharedClip;

      if (this.canceled.has(id)) {
        await supabase.from("shared_clips").delete().eq("id", clip.id);
        return;
      }

      this.patch(id, { clipId: clip.id, slug: clip.share_slug });

      // 2. Upload original video to public bucket with progress
      const originalPath = `${user.id}/${clip.share_slug}/original.${ext}`;
      this.patch(id, { status: "uploading" });

      await this.uploadWithProgress(id, "shared-clips", originalPath, blob, mime);

      if (this.canceled.has(id)) {
        await supabase.storage.from("shared-clips").remove([originalPath]);
        await supabase.from("shared_clips").delete().eq("id", clip.id);
        return;
      }

      // 3. Generate + upload thumbnail (best effort)
      this.patch(id, { status: "processing", progress: 1 });
      let thumbnailPath: string | null = null;
      try {
        const thumb = await extractThumbnail(blob);
        if (thumb) {
          thumbnailPath = `${user.id}/${clip.share_slug}/thumb.jpg`;
          const { error: tErr } = await supabase.storage
            .from("shared-clips")
            .upload(thumbnailPath, thumb, { contentType: "image/jpeg", upsert: true });
          if (tErr) thumbnailPath = null;
        }
      } catch {
        thumbnailPath = null;
      }

      // 4. Finalize
      const { error: updErr } = await supabase
        .from("shared_clips")
        .update({
          original_path: originalPath,
          stream_path: originalPath, // MVP: stream original; future: server transcode
          thumbnail_path: thumbnailPath,
          processing_status: "ready",
        })
        .eq("id", clip.id);
      if (updErr) throw updErr;

      this.patch(id, { status: "ready", progress: 1 });
      window.dispatchEvent(
        new CustomEvent("rubix:shared-clip-ready", { detail: { clipId: clip.id, slug: clip.share_slug } }),
      );
    } catch (e) {
      if (this.canceled.has(id)) return;
      this.patch(id, {
        status: "error",
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  }

  private uploadWithProgress(
    jobId: string,
    bucket: string,
    path: string,
    blob: Blob,
    contentType: string,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Use signed upload URL for XHR-tracked progress
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(path);
        if (error || !data) return reject(error ?? new Error("Could not get upload URL"));

        const xhr = new XMLHttpRequest();
        this.xhrs.set(jobId, xhr);
        xhr.open("PUT", data.signedUrl, true);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.setRequestHeader("x-upsert", "false");

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            this.patch(jobId, { progress: ev.loaded / ev.total });
          }
        };
        xhr.onload = () => {
          this.xhrs.delete(jobId);
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => {
          this.xhrs.delete(jobId);
          reject(new Error("Network error"));
        };
        xhr.onabort = () => {
          this.xhrs.delete(jobId);
          reject(new Error("Aborted"));
        };
        xhr.send(blob);
      } catch (e) {
        reject(e);
      }
    });
  }
}

export const uploadStore = new UploadStore();

async function safeReadVideoMeta(
  blob: Blob,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.preload = "metadata";
      const done = (r: { width: number; height: number; duration: number }) => {
        URL.revokeObjectURL(url);
        resolve(r);
      };
      v.onloadedmetadata = () =>
        done({
          width: v.videoWidth,
          height: v.videoHeight,
          duration: Math.round(v.duration || 0),
        });
      v.onerror = () => done({ width: 0, height: 0, duration: 0 });
      v.src = url;
      setTimeout(() => done({ width: 0, height: 0, duration: 0 }), 4000);
    } catch {
      resolve({ width: 0, height: 0, duration: 0 });
    }
  });
}

import { useSyncExternalStore } from "react";
export const useUploads = () =>
  useSyncExternalStore(
    (l) => uploadStore.subscribe(l),
    () => uploadStore.jobs,
    () => uploadStore.jobs,
  );
