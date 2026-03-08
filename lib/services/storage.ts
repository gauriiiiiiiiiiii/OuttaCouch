type UploadImageParams = {
  file: File;
  bucket: string;
  folder?: string;
};

type UploadResult = {
  publicUrl?: string;
  path?: string;
  error?: string;
};

export const StorageService = {
  async uploadImage({ file, bucket, folder }: UploadImageParams): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);
    if (folder) {
      formData.append("folder", folder);
    }

    const res = await fetch("/api/storage/upload", {
      method: "POST",
      body: formData
    });

    const data = (await res.json().catch(() => ({}))) as UploadResult & {
      error?: string;
    };

    if (!res.ok || !data.publicUrl) {
      return { error: data.error || "Image upload failed." };
    }

    return { publicUrl: data.publicUrl, path: data.path };
  }
};
