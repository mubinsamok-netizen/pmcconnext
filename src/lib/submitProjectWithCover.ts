export function submitProjectWithCover(method: "POST" | "PUT", body: FormData, onProgress: (percent: number) => void) {
  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, "/api/projects");
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.floor(event.loaded / event.total * 100)));
      }
    };
    request.upload.onload = () => onProgress(100);
    request.onload = () => resolve(new Response(request.responseText || null, { status: request.status }));
    request.onerror = request.onabort = () => reject(new Error("ส่งภาพปกไม่สำเร็จ กรุณาลองอีกครั้ง"));
    request.send(body);
  });
}
