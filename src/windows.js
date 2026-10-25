'use strict';
// Tracks the on-screen rectangles of other applications' windows, front-to-back,
// so the fighters can use window title bars as platforms.
//   Windows: a long-running PowerShell process calling user32/dwmapi.
//   macOS:   a long-running JXA (osascript) process calling CGWindowListCopyWindowInfo.
//   Linux:   polls `wmctrl -lG` (X11 only; Wayland just gets the floor).
const { spawn, execFile } = require('child_process');

function lineReader(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  });
}

function windowsScript(overlayTitle, pid) {
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SfWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  static string Esc(string s) {
    var sb = new StringBuilder();
    foreach (char c in s) {
      if (c == '\\\\' || c == '"') { sb.Append('\\\\'); sb.Append(c); }
      else if (c >= ' ') sb.Append(c);
    }
    return sb.ToString();
  }
  public static string Get(string overlay, uint self) {
    var sb = new StringBuilder("[");
    bool first = true;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int len = GetWindowTextLength(h);
      if (len == 0) return true;
      int cloaked = 0;
      DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0) return true;
      uint pid = 0;
      GetWindowThreadProcessId(h, out pid);
      if (pid == self) return true;
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
      if (r.R - r.L < 60 || r.B - r.T < 40) return true;
      var t = new StringBuilder(len + 1);
      GetWindowText(h, t, len + 1);
      string title = t.ToString();
      if (title == overlay || title == "Program Manager") return true;
      if (!first) sb.Append(",");
      first = false;
      sb.Append("{\\"id\\":\\"" + h.ToInt64() + "\\",\\"title\\":\\"" + Esc(title) + "\\",\\"x\\":" + r.L + ",\\"y\\":" + r.T + ",\\"w\\":" + (r.R - r.L) + ",\\"h\\":" + (r.B - r.T) + "}");
      return true;
    }, IntPtr.Zero);
    sb.Append("]");
    return sb.ToString();
  }
}
"@
[SfWin]::SetProcessDPIAware() | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  [Console]::Out.WriteLine([SfWin]::Get("${overlayTitle}", ${pid}))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 350
}
`;
}

function macScript(pid) {
  return `
ObjC.import('Foundation');
ObjC.import('CoreGraphics');
function out(s) {
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
}
function run() {
  while (true) {
    try {
      var ref = $.CGWindowListCopyWindowInfo(1 | 16, 0);
      var list = ObjC.deepUnwrap(ObjC.castRefToObject(ref)) || [];
      var res = [];
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if (w.kCGWindowLayer !== 0 || w.kCGWindowOwnerPID === ${pid}) continue;
        if (w.kCGWindowAlpha !== undefined && w.kCGWindowAlpha < 0.1) continue;
        var b = w.kCGWindowBounds;
        if (!b || b.Width < 60 || b.Height < 40) continue;
        res.push({ id: String(w.kCGWindowNumber), title: String(w.kCGWindowOwnerName || ''), x: b.X, y: b.Y, w: b.Width, h: b.Height });
      }
      out(JSON.stringify(res));
    } catch (e) {
      out('[]');
    }
    delay(0.35);
  }
}
`;
}

function startPersistent(cmd, args, onWindows) {
  let child = null;
  let stopped = false;
  let last = '';
  const launch = () => {
    if (stopped) return;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch (e) {
      return;
    }
    lineReader(child.stdout, (line) => {
      if (line === last || line[0] !== '[') return;
      last = line;
      try { onWindows(JSON.parse(line)); } catch (e) { /* partial line */ }
    });
    child.on('error', () => {});
    child.on('exit', () => { child = null; if (!stopped) setTimeout(launch, 3000); });
  };
  launch();
  return { stop() { stopped = true; if (child) child.kill(); } };
}

function startLinux(overlayTitle, onWindows) {
  let stopped = false;
  let last = '';
  let failures = 0;
  const poll = () => {
    if (stopped) return;
    execFile('wmctrl', ['-d'], (err1, desk) => {
      execFile('wmctrl', ['-lG'], (err2, out) => {
        if (stopped) return;
        if (err2) {
          // wmctrl missing (or Wayland): back off and keep the floor-only world.
          failures++;
          setTimeout(poll, failures > 3 ? 15000 : 2000);
          return;
        }
        failures = 0;
        let current = null;
        if (!err1) {
          const cur = desk.split('\n').find((l) => /^\d+\s+\*/.test(l));
          if (cur) current = parseInt(cur, 10);
        }
        const list = [];
        for (const line of out.split('\n')) {
          const m = line.match(/^(0x[0-9a-f]+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+\S+\s?(.*)$/i);
          if (!m) continue;
          const deskNo = parseInt(m[2], 10);
          const title = m[7] || '';
          if (deskNo < 0 || (current !== null && deskNo !== current)) continue;
          if (title === overlayTitle) continue;
          const w = parseInt(m[5], 10);
          const h = parseInt(m[6], 10);
          if (w < 60 || h < 40) continue;
          list.push({ id: m[1], title, x: parseInt(m[3], 10), y: parseInt(m[4], 10), w, h });
        }
        // wmctrl lists bottom-to-top-ish; reverse so the newest window counts as front-most.
        list.reverse();
        const json = JSON.stringify(list);
        if (json !== last) { last = json; onWindows(list); }
        setTimeout(poll, 400);
      });
    });
  };
  poll();
  return { stop() { stopped = true; } };
}

function startWindowTracker({ overlayTitle, pid, onWindows }) {
  if (process.env.STICKFIGHT_NO_WINDOWS === '1') return { stop() {} };
  if (process.platform === 'win32') {
    const script = windowsScript(overlayTitle, pid);
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return startPersistent('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], onWindows);
  }
  if (process.platform === 'darwin') {
    return startPersistent('osascript', ['-l', 'JavaScript', '-e', macScript(pid)], onWindows);
  }
  return startLinux(overlayTitle, onWindows);
}

module.exports = { startWindowTracker };
