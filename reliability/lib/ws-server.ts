// A WebSocket server small enough to read: the handshake, text frames, ping,
// and close. Nothing else.
//
// The generated chain needs one because the tools that can subscribe to new
// blocks - Envio, Ponder, the Squid SDK - learn about the head by push rather
// than by asking, and head latency measured by polling alone would be
// measuring the poll. Node ships a WebSocket client and no server, and the
// suite takes no dependencies, so this is RFC 6455 cut down to what a JSON-RPC
// endpoint uses: unfragmented text in both directions, with continuation
// frames accepted from clients that send them anyway. No extensions, no
// compression, no binary.

import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

/** The GUID every WebSocket handshake hashes the client's key with. */
const HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

export interface WsConnection {
  /** Send one text message. A no-op once the connection is closed. */
  send(text: string): void;
  close(): void;
  readonly open: boolean;
}

/**
 * Complete the handshake for an HTTP upgrade request and start reading
 * frames. `onMessage` gets each complete text message; `onClose` runs once,
 * however the connection ended.
 */
export function acceptWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  onMessage: (text: string, connection: WsConnection) => void,
  onClose: (connection: WsConnection) => void
): WsConnection | null {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return null;
  }
  const accept = createHash("sha1").update(key + HANDSHAKE_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  let open = true;
  let buffered = Buffer.alloc(0);
  let fragments: Buffer[] = [];

  const connection: WsConnection = {
    send(text) {
      if (open) socket.write(frame(OP_TEXT, Buffer.from(text, "utf8")));
    },
    close() {
      if (!open) return;
      open = false;
      socket.end(frame(OP_CLOSE, Buffer.alloc(0)));
    },
    get open() {
      return open;
    },
  };

  const finish = () => {
    if (open) open = false;
    onClose(connection);
  };
  socket.once("close", finish);
  socket.on("error", () => socket.destroy());

  socket.on("data", (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (;;) {
      const parsed = readFrame(buffered);
      if (!parsed) return;
      buffered = buffered.subarray(parsed.length);
      const { fin, opcode, payload } = parsed;

      if (opcode === OP_PING) {
        if (open) socket.write(frame(OP_PONG, payload));
        continue;
      }
      if (opcode === OP_PONG) continue;
      if (opcode === OP_CLOSE) {
        connection.close();
        return;
      }
      if (opcode === OP_BINARY) continue;
      if (opcode === OP_TEXT || opcode === OP_CONTINUATION) {
        fragments.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(fragments).toString("utf8");
        fragments = [];
        onMessage(text, connection);
      }
    }
  });

  return connection;
}

/** One frame from the front of the buffer, or null until all of it is there. */
function readFrame(
  buffer: Buffer
): { fin: boolean; opcode: number; payload: Buffer; length: number } | null {
  if (buffer.length < 2) return null;
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskLength = masked ? 4 : 0;
  if (buffer.length < offset + maskLength + length) return null;
  const mask = masked ? buffer.subarray(offset, offset + 4) : null;
  const payload = Buffer.from(buffer.subarray(offset + maskLength, offset + maskLength + length));
  if (mask) {
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }
  return { fin, opcode, payload, length: offset + maskLength + length };
}

/** A single unmasked frame, as a server sends them. */
function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}
