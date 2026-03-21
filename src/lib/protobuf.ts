type FieldMap = Map<number, (number | Uint8Array)[]>;

function readVarint(
  data: Uint8Array,
  pos: number
): [number, number] {
  let result = 0;
  let shift = 0;
  while (pos < data.length) {
    const b = data[pos++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [result, pos];
}

export function decodePb(
  data: Uint8Array,
  start = 0,
  end?: number
): FieldMap {
  const stop = end ?? data.length;
  const fields: FieldMap = new Map();

  let pos = start;
  while (pos < stop) {
    let tag: number;
    try {
      [tag, pos] = readVarint(data, pos);
    } catch {
      break;
    }
    const fn = tag >> 3;
    const wt = tag & 7;
    if (fn === 0) break;

    let v: number | Uint8Array;
    try {
      if (wt === 0) {
        [v, pos] = readVarint(data, pos);
      } else if (wt === 1) {
        v = data.slice(pos, pos + 8);
        pos += 8;
      } else if (wt === 2) {
        let n: number;
        [n, pos] = readVarint(data, pos);
        v = data.slice(pos, pos + n);
        pos += n;
      } else if (wt === 5) {
        v = data.slice(pos, pos + 4);
        pos += 4;
      } else {
        break;
      }
    } catch {
      break;
    }

    const existing = fields.get(fn);
    if (existing) existing.push(v);
    else fields.set(fn, [v]);
  }
  return fields;
}

function tryStr(b: Uint8Array): string | null {
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(b);
    return /[\x00-\x08\x0e-\x1f]/.test(s) ? null : s;
  } catch {
    return null;
  }
}

export type RawRecording = {
  recording_id: number;
  start_time: string | null;
  caller_phone: string | null;
  callee_phone: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
};

function parseParticipant(bytes: Uint8Array): {
  isInternal: boolean;
  extension: string | null;
  phone: string | null;
  displayName: string | null;
} {
  const fields = decodePb(bytes);
  const typeVal = fields.get(2)?.[0]; // 1 = internal, 128 = external
  const isInternal = typeVal === 1;

  const ext = fields.get(3)?.[0];
  const extension = ext instanceof Uint8Array ? tryStr(ext) : null;

  const ph = fields.get(4)?.[0];
  const phone = ph instanceof Uint8Array ? tryStr(ph) : null;

  const dn = fields.get(5)?.[0];
  const displayName = dn instanceof Uint8Array ? tryStr(dn) : null;

  return { isInternal, extension, phone, displayName };
}

export function parseRecordingsResponse(
  data: Uint8Array
): RawRecording[] {
  const outer = decodePb(data);

  let contentBlob: Uint8Array | null = null;
  for (const [fn, values] of outer) {
    if (fn === 1) continue;
    for (const v of values) {
      if (v instanceof Uint8Array && v.length > 50) {
        contentBlob = v;
        break;
      }
    }
    if (contentBlob) break;
  }
  if (!contentBlob) return [];

  const entriesMap = decodePb(contentBlob);
  const recordings: RawRecording[] = [];

  for (const entryBytes of entriesMap.get(1) ?? []) {
    if (!(entryBytes instanceof Uint8Array)) continue;
    const entry = decodePb(entryBytes);

    const recIdArr = entry.get(1);
    const recId = recIdArr?.[0];
    if (typeof recId !== "number" || recId === 0) continue;

    const rec: RawRecording = {
      recording_id: recId,
      start_time: null,
      caller_phone: null,
      callee_phone: null,
      agent_name: null,
      duration_seconds: null,
    };

    // field[3]: {f1: start_unix_seconds, f2: duration_microseconds}
    for (const tsBytes of entry.get(3) ?? []) {
      if (!(tsBytes instanceof Uint8Array)) continue;
      const tsFields = decodePb(tsBytes);
      const ts = tsFields.get(1)?.[0];
      if (typeof ts === "number" && ts > 1_000_000_000) {
        rec.start_time = new Date(ts * 1000).toISOString();
      }
      const dur = tsFields.get(2)?.[0];
      if (typeof dur === "number" && dur > 0) {
        rec.duration_seconds = Math.round(dur / 1_000_000);
      }
      if (rec.start_time) break;
    }

    // field[5]: participant sub-messages (one per party)
    for (const participantBytes of entry.get(5) ?? []) {
      if (!(participantBytes instanceof Uint8Array)) continue;
      const p = parseParticipant(participantBytes);
      if (p.isInternal) {
        // Agent side
        if (!rec.callee_phone) rec.callee_phone = p.extension ?? p.phone;
        if (!rec.agent_name) rec.agent_name = p.displayName;
      } else {
        // External caller
        if (!rec.caller_phone) rec.caller_phone = p.phone ?? p.extension;
      }
    }

    recordings.push(rec);
  }
  return recordings;
}
