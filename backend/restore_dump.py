"""
Restore a PostgreSQL custom-format dump to a target DB (no pg_restore needed).
Tested against PG16 dumps (format v1.15).
"""

import struct, zlib, io, sys, os
import psycopg2

DUMP_FILE = r"C:\Users\KasyapRangaCharyulu\Downloads\kit-db-dump.dump"
TARGET_DB  = "postgresql://devuser:Ksquare%40devuser123@34.47.214.73:5432/postgres"

# ---------------------------------------------------------------------------
# Low-level reader
# ---------------------------------------------------------------------------
class R:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def byte(self):
        b = self.d[self.p]; self.p += 1; return b

    def bytes(self, n):
        s = self.d[self.p:self.p+n]; self.p += n; return s

    def int(self, isz=4):
        # sign-magnitude: 1 sign byte (0=pos, 1=neg) + isz LE value bytes
        sign = self.byte()
        val  = 0
        for sh in range(0, isz*8, 8):
            b = self.byte()
            if b: val |= b << sh
        return -val if sign else val

    def string(self, isz=4):
        n = self.int(isz)
        if n < 0: return None
        return self.bytes(n).decode("utf-8", errors="replace")

    def off(self, osz=8):
        # 1 flag byte + osz offset bytes (always written, even for NO_DATA)
        flag = self.byte()
        val = 0
        for sh in range(0, osz*8, 8):
            b = self.byte()
            if b: val |= b << sh
        return val if flag == 2 else -1  # 2=K_OFFSET_POS_SET

    def skip_to(self, pos):
        self.p = pos

# ---------------------------------------------------------------------------
# Find tocCount position empirically
# ---------------------------------------------------------------------------
def find_toc_start(data, int_size, off_size):
    """
    Scan for the position where tocCount lives.
    We know the first TOC entry has tag="ENCODING", so we search for it
    and work backwards to find the tocCount int.
    """
    KNOWN_TAG = b"ENCODING"
    idx = data.find(KNOWN_TAG)
    if idx < 0:
        raise RuntimeError("Cannot find 'ENCODING' tag in dump")

    # tag string is preceded by its 5-byte length int (sign=0, val=8)
    # tag_int_start = idx - 5
    tag_int_pos = idx - (1 + int_size)

    # Before tag: oid string (1 char "0") + its int
    # oid_int_pos = tag_int_pos - 5 - 1
    oid_str_pos  = tag_int_pos - 1          # 1-byte string "0"
    oid_int_pos  = oid_str_pos - (1 + int_size)

    # Before oid: tableoid string (1 char "0") + its int
    tableoid_str_pos = oid_int_pos - 1
    tableoid_int_pos = tableoid_str_pos - (1 + int_size)

    # Before tableoid: had_dumper int (5 bytes)
    had_dumper_pos = tableoid_int_pos - (1 + int_size)

    # Before had_dumper: dump_id int (5 bytes)
    dump_id_pos = had_dumper_pos - (1 + int_size)

    # dump_id_pos is the start of the first TOC entry
    toc_entries_start = dump_id_pos

    # tocCount int immediately precedes it
    toc_count_pos = toc_entries_start - (1 + int_size)

    return toc_count_pos, toc_entries_start

# ---------------------------------------------------------------------------
# Parse TOC
# ---------------------------------------------------------------------------
def parse_toc(r, toc_count, int_size, off_size):
    entries = []
    for entry_num in range(toc_count):
        pos_start  = r.p
        dump_id    = r.int(int_size)
        had_dumper = r.int(int_size)
        table_oid  = r.string(int_size)
        oid        = r.string(int_size)
        tag        = r.string(int_size)
        desc       = r.string(int_size)
        section    = r.int(int_size)
        defn       = r.string(int_size)
        drop_stmt  = r.string(int_size)
        copy_stmt  = r.string(int_size)
        namespace  = r.string(int_size)
        tablespace = r.string(int_size)
        tableam    = r.string(int_size)
        owner      = r.string(int_size)
        with_oids  = r.string(int_size)

        # dependency list: strings until None
        while True:
            dep = r.string(int_size)
            if dep is None:
                break

        # dataPos is written for every entry in v >= 1.3
        data_offset = r.off(off_size)

        entries.append({
            "dump_id":    dump_id,
            "had_dumper": had_dumper,
            "tag":        tag or "",
            "desc":       desc or "",
            "section":    section,
            "defn":       defn or "",
            "drop_stmt":  drop_stmt or "",
            "copy_stmt":  copy_stmt or "",
            "data_offset": data_offset,
        })
    return entries

# ---------------------------------------------------------------------------
# Read data blocks using per-entry offsets from TOC
# ---------------------------------------------------------------------------
def read_one_block(r, int_size):
    """Read one data block starting at current position. Returns (dump_id, data) or None."""
    btype   = r.byte()
    dump_id = r.int(int_size)
    if btype == 3:
        return None
    # Collect all raw chunks — the zlib stream may span multiple chunks
    raw_parts = []
    while True:
        chunk_len = r.int(int_size)
        if chunk_len == 0:
            break
        raw_parts.append(r.bytes(chunk_len))
    combined = b"".join(raw_parts)
    # Try decompressing the whole stream at once
    if combined and combined[0] == 0x78:
        try:
            return (dump_id, zlib.decompress(combined))
        except Exception:
            pass
    return (dump_id, combined)

def read_data_blocks(r, entries, int_size):
    blocks = {}
    file_size = len(r.d)

    # Collect entries that have a valid data offset
    data_entries = [(e["dump_id"], e["data_offset"]) for e in entries
                    if e["had_dumper"] and 0 <= e["data_offset"] < file_size]

    if data_entries:
        # Use stored offsets (absolute file positions)
        for dump_id, offset in data_entries:
            r.skip_to(offset)
            try:
                result = read_one_block(r, int_size)
                if result:
                    blocks[result[0]] = result[1]
            except Exception as e:
                print(f"  [warn] block at offset {offset} (dump_id {dump_id}): {e}")
    else:
        # Fallback: read sequentially from current position
        print(f"  [info] no stored offsets, reading sequentially from pos {r.p}")
        while r.p < file_size - 6:
            try:
                result = read_one_block(r, int_size)
                if result is None:
                    break
                blocks[result[0]] = result[1]
            except Exception as e:
                print(f"  [warn] sequential block error at {r.p}: {e}")
                break
    return blocks

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
SKIP = {"ACL", "COMMENT", "EXTENSION", "EVENT TRIGGER"}

def restore(entries, blocks, conn):
    cur = conn.cursor()
    stats = {"ddl_ok": 0, "ddl_skip": 0, "data_ok": 0, "data_skip": 0}

    # DDL pass (PRE_DATA then POST_DATA; DATA entries have no defn)
    for section in [1, 2, 3]:
        for e in entries:
            if e["section"] != section:
                continue
            if e["desc"] in SKIP:
                stats["ddl_skip"] += 1
                continue
            defn = (e["defn"] or "").strip()
            if defn:
                try:
                    cur.execute(defn)
                    conn.commit()
                    stats["ddl_ok"] += 1
                    print(f"  DDL  [{e['desc']}] {e['tag'][:60]}")
                except Exception as ex:
                    conn.rollback()
                    stats["ddl_skip"] += 1
                    print(f"  SKIP [{e['desc']}] {e['tag'][:60]}  -- {str(ex)[:80]}")

    # Truncate all target tables (cascade to handle FK refs) before loading
    data_entries = [
        e for e in entries
        if e["had_dumper"] and e["dump_id"] in blocks and e["desc"] not in SKIP
    ]
    if data_entries:
        tables = ", ".join(f'public."{e["tag"]}"' for e in data_entries)
        try:
            cur.execute(f"TRUNCATE {tables} RESTART IDENTITY CASCADE")
            conn.commit()
            print(f"  Truncated {len(data_entries)} tables")
        except Exception as ex:
            conn.rollback()
            print(f"  [warn] truncate failed: {ex}")

    # Data pass with retries to handle FK ordering
    pending = [
        e for e in entries
        if e["had_dumper"] and e["dump_id"] in blocks and e["desc"] not in SKIP
    ]
    failures = {}  # tag -> last error
    max_rounds = len(pending) + 1
    for _round in range(max_rounds):
        if not pending:
            break
        next_pending = []
        for e in pending:
            copy_stmt = (e["copy_stmt"] or "").strip()
            if not copy_stmt:
                copy_stmt = f'COPY public."{e["tag"]}" FROM stdin;'
            raw = blocks[e["dump_id"]]
            try:
                cur.copy_expert(copy_stmt, io.BytesIO(raw))
                conn.commit()
                stats["data_ok"] += 1
                failures.pop(e["tag"], None)
                print(f"  DATA [{e['tag']}]  {len(raw)} bytes")
            except Exception as ex:
                conn.rollback()
                failures[e["tag"]] = str(ex)
                next_pending.append(e)
        if len(next_pending) == len(pending):
            break  # no progress
        pending = next_pending

    for tag, msg in failures.items():
        stats["data_skip"] += 1
        print(f"  DATA FAIL [{tag}] -- {msg[:100]}")

    cur.close()
    return stats

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)

    with open(DUMP_FILE, "rb") as f:
        data = f.read()
    print(f"Dump file: {len(data):,} bytes")

    # Fixed header
    assert data[:5] == b"PGDMP"
    vmaj, vmin, vrev, int_size, off_size, fmt = struct.unpack_from("BBBBBB", data, 5)
    print(f"Version: {vmaj}.{vmin}.{vrev}  intSize={int_size}  offSize={off_size}")

    # Find TOC location
    toc_count_pos, toc_start = find_toc_start(data, int_size, off_size)
    print(f"TOC count int at pos {toc_count_pos}, TOC entries at pos {toc_start}")

    r = R(data)
    r.skip_to(toc_count_pos)
    toc_count = r.int(int_size)
    print(f"TOC entries: {toc_count}")

    assert r.p == toc_start, f"TOC start mismatch: {r.p} vs {toc_start}"

    # Parse TOC
    entries = parse_toc(r, toc_count, int_size, off_size)
    descs = {}
    for e in entries:
        descs[e["desc"]] = descs.get(e["desc"], 0) + 1
    print("TOC summary:")
    for k, v in sorted(descs.items()):
        print(f"  {k:30s} x{v}")

    # Read data blocks
    blocks = read_data_blocks(r, entries, int_size)
    print(f"Data blocks: {len(blocks)}")

    # Connect and restore
    print(f"\nConnecting to target DB...")
    conn = psycopg2.connect(TARGET_DB)
    conn.autocommit = False
    print("Connected.\n")

    stats = restore(entries, blocks, conn)
    conn.close()

    print(f"\n{'='*60}")
    print(f"DDL applied: {stats['ddl_ok']}  skipped: {stats['ddl_skip']}")
    print(f"Data tables: {stats['data_ok']}  failed:  {stats['data_skip']}")
    print("Done.")

if __name__ == "__main__":
    main()
