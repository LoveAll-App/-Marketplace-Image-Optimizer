import type { NextFunction, Request, Response } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const hostname = (h: string | undefined): string => (h ?? "").replace(/:\d+$/, "").toLowerCase();

/**
 * The API only ever serves this machine. Reject foreign Host headers (DNS rebinding) and
 * cross-origin browser requests so a random web page can't drive the local optimizer.
 */
export function localOnly(req: Request, res: Response, next: NextFunction): void {
  if (!LOCAL_HOSTS.has(hostname(req.headers.host))) {
    res.status(403).json({ error: "Forbidden host" });
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (!LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase())) {
        res.status(403).json({ error: "Forbidden origin" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Bad origin" });
      return;
    }
  }
  next();
}

/** Fix multer's latin1-decoded UTF-8 filenames, then strip path components. */
export function cleanUploadName(name: string): string {
  let out = name;
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (!decoded.includes("�")) out = decoded;
  } catch {
    /* keep as is */
  }
  out = out.split(/[\\/]/).pop() ?? out;
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\u0000-\u001f]/g, "").trim();
  return out.slice(0, 200) || "image";
}
