import { inflateRawSync } from "node:zlib";

// 供验收和测试读取生成的 ZIP；不处理用户上传文件。
export function zipEntries(data) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = data.readUInt32LE(end + 16);
  return Array.from({ length: data.readUInt16LE(end + 10) }, () => {
    const method = data.readUInt16LE(offset + 10),
      size = data.readUInt32LE(offset + 20);
    const length = data.readUInt16LE(offset + 28),
      extra = data.readUInt16LE(offset + 30),
      comment = data.readUInt16LE(offset + 32);
    const name = data.subarray(offset + 46, offset + 46 + length).toString();
    const local = data.readUInt32LE(offset + 42);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const bytes = data.subarray(start, start + size);
    offset += 46 + length + extra + comment;
    return { name, method, data: method === 8 ? inflateRawSync(bytes) : bytes };
  });
}
