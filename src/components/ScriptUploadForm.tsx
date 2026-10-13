"use client";

import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/reel/Button";

export function ScriptUploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [status, setStatus] = React.useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file) return;
    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/projects/${projectId}/upload`, { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      setStatus("error");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-md)] border border-dashed border-zinc-200 px-6 py-14 text-center">
      <UploadCloud className="h-6 w-6 text-zinc-400" />
      <div>
        <p className="text-sm font-medium text-zinc-800">Upload a script</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          PDF or Final Draft (.fdx). Reel will extract a scene breakdown, a projected cast & crew
          list, and a first-pass budget within a few minutes.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.fdx"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-zinc-600">{file.name}</span>
          <Button size="sm" loading={status === "uploading"} onClick={submit}>
            Upload &amp; break down
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
      )}

      {error && <p className="text-[13px] text-danger-600">{error}</p>}
    </div>
  );
}
