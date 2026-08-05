import { Socket } from "node:net";

export type ScanVerdict = { status: "CLEAN" } | { status: "INFECTED"; signature: string };

/**
 * Malware scanning contract. Production/dev use ClamAV over clamd INSTREAM;
 * tests inject a deterministic double. When no scanner is configured the
 * document pipeline FAILS CLOSED — unscanned bytes are never served.
 */
export abstract class Scanner {
  abstract scan(buffer: Buffer): Promise<ScanVerdict>;
}

const SCAN_TIMEOUT_MS = 30_000;

/** clamd INSTREAM client (no third-party wrapper needed). */
export class ClamAvScanner extends Scanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    super();
  }

  scan(buffer: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let response = "";
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(SCAN_TIMEOUT_MS, () => fail(new Error("clamd timeout")));
      socket.on("error", fail);
      socket.on("data", (chunk) => {
        response += chunk.toString("utf8");
      });
      socket.on("close", () => {
        const text = response.replace(/\0/g, "").trim();
        if (text.endsWith("OK")) return resolve({ status: "CLEAN" });
        const match = /: (.+) FOUND$/.exec(text);
        if (match?.[1]) {
          return resolve({ status: "INFECTED", signature: match[1] });
        }
        reject(new Error(`unexpected clamd response: ${text}`));
      });
      socket.connect(this.port, this.host, () => {
        socket.write("zINSTREAM\0");
        // INSTREAM protocol: 4-byte big-endian chunk length + data, 0 = done.
        const CHUNK = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += CHUNK) {
          const slice = buffer.subarray(offset, offset + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(slice.length, 0);
          socket.write(len);
          socket.write(slice);
        }
        const done = Buffer.alloc(4);
        socket.write(done);
      });
    });
  }
}

/** Env-driven factory: unset CLAMAV_HOST → null → pipeline fails closed. */
export function buildScanner(): Scanner | null {
  const host = process.env.CLAMAV_HOST;
  if (!host) return null;
  return new ClamAvScanner(host, Number(process.env.CLAMAV_PORT ?? 3310));
}

export const SCANNER = "SCANNER";
