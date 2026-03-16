# Possible Features

## Call Detail Modal — Transcript Panel
The current Dialog layout works but becomes awkward on long transcripts (the whole modal scrolls). A better pattern would be a sticky header strip (sentiment bar + key metadata) with a dedicated scrollable transcript pane below, so metadata stays visible while reading the full call transcript.

## Virtual / Windowed Table
Currently all filtered calls are rendered in the DOM at once. Fine for hundreds of rows, but will noticeably degrade with thousands. `@tanstack/react-virtual` is a small, zero-dependency add that would make the table render only the visible rows.

## Avg Call Duration Stat Card
Show average call duration (e.g. "4m 32s") as a 5th stat card. Requires storing duration in the DB.

### Duration extraction approach
The WAV file is downloaded, transcribed, then dropped. Duration should be extracted **before** dropping the file. Options:
- `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 recording.wav` — zero extra deps if ffmpeg is already on the server
- Read the WAV header directly: bytes 40–43 (little-endian uint32) = data chunk size, bytes 28–31 = byte rate. `duration = dataSize / byteRate` — pure Node, no subprocess
- `audiowaveform` or `music-metadata` npm package if a pure-JS solution is preferred

Once extracted, store as `duration_seconds INTEGER` on the `calls` table and surface it in the stats row and call detail modal.
