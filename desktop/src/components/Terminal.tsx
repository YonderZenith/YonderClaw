import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { onPtyExit, onPtyOutput, ptyResize, ptySpawn, ptyWrite, runAutoconnectIfNeeded } from "../lib/tauri";
import { resolveLaunch } from "../lib/launch";
import { useStore } from "../store";

export function Terminal() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasSpawnedRef = useRef(false);
  const projectDir = useStore((s) => s.projectDir);
  const setPty = useStore((s) => s.setPty);
  const setClaudePath = useStore((s) => s.setClaudePath);
  const setSession = useStore((s) => s.setSession);

  useEffect(() => {
    if (!containerRef.current || !projectDir || hasSpawnedRef.current) return;
    hasSpawnedRef.current = true;

    const term = new XTerminal({
      fontFamily: '"Cascadia Mono", "Fira Code", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#0a0912",
        foreground: "#e7e4f0",
        cursor: "#b490ff",
      },
      convertEol: false,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const unlisteners: Array<() => void> = [];

    (async () => {
      try {
        setPty("spawning");
        const launch = await resolveLaunch(projectDir);
        setClaudePath(launch.claudePath);
        setSession(launch.sessionId, launch.mode);

        const banner =
          launch.mode === "resume"
            ? `\x1b[38;5;141m▸ resuming session ${launch.sessionId!.slice(0, 8)}…\x1b[0m\r\n`
            : launch.mode === "continue"
              ? `\x1b[38;5;141m▸ no captured session — using --continue\x1b[0m\r\n`
              : `\x1b[38;5;141m▸ first launch — starting Claude\x1b[0m\r\n`;
        term.write(banner);

        // Wire output/exit BEFORE autoconnect so its handshake also streams to terminal.
        const out = await onPtyOutput((chunk) => term.write(chunk));
        unlisteners.push(out);
        const exit = await onPtyExit(() => {
          term.write("\r\n\x1b[38;5;203m▸ claude exited\x1b[0m\r\n");
          setPty("exited");
        });
        unlisteners.push(exit);

        // QIS autoconnect on first launch (no-op when already connected).
        try {
          await runAutoconnectIfNeeded(projectDir);
        } catch (acErr) {
          const acMsg = acErr instanceof Error ? acErr.message : String(acErr);
          term.write(`\x1b[38;5;208m▸ autoconnect skipped: ${acMsg}\x1b[0m\r\n`);
        }

        await ptySpawn({
          shell: launch.claudePath,
          args: launch.args,
          cols: term.cols,
          rows: term.rows,
          cwd: projectDir,
        });

        setPty("running");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        term.write(`\r\n\x1b[38;5;203m▸ failed to start: ${msg}\x1b[0m\r\n`);
        setPty("error", msg);
      }
    })();

    const onData = term.onData((data) => {
      ptyWrite(data).catch(() => {});
    });
    unlisteners.push(() => onData.dispose());

    const onResize = term.onResize(({ cols, rows }) => {
      ptyResize(cols, rows).catch(() => {});
    });
    unlisteners.push(() => onResize.dispose());

    // Debounced refit — avoids fighting the browser's resize coalescing and
    // the brief frame where the inner xterm viewport is wider than the new
    // pane width (which used to surface as a stacked second scrollbar on
    // window minimize/restore).
    let refitTimer: number | null = null;
    const scheduleFit = () => {
      if (refitTimer !== null) window.clearTimeout(refitTimer);
      refitTimer = window.setTimeout(() => {
        try { fit.fit(); } catch {}
        refitTimer = null;
      }, 50);
    };
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", scheduleFit);
    unlisteners.push(() => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleFit);
      if (refitTimer !== null) window.clearTimeout(refitTimer);
    });

    return () => {
      unlisteners.forEach((u) => u());
      term.dispose();
    };
  }, [projectDir, setPty, setClaudePath, setSession]);

  return <div ref={containerRef} className="term-wrap" />;
}
