# Bundled FFmpeg binaries

The RUBIX clip recorder spawns FFmpeg as a child process from this folder.

Drop platform-specific static builds here before packaging:

```
resources/bin/
  ffmpeg.exe     (Windows)
  ffprobe.exe    (Windows)
  ffmpeg         (macOS / Linux, +x)
  ffprobe        (macOS / Linux, +x)
```

Recommended sources:

- Windows: <https://www.gyan.dev/ffmpeg/builds/> (full build)
- macOS:   <https://evermeet.cx/ffmpeg/>
- Linux:   <https://johnvansickle.com/ffmpeg/> (static)

`electron-builder.json` ships everything in this directory as
`extraResources`, so the binaries end up at
`<install>/resources/bin/ffmpeg(.exe)` on the user's machine.

If the binaries are missing, the recorder falls back to `ffmpeg` on PATH
and shows a warning in Settings → Clips.
