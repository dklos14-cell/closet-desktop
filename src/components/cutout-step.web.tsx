import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chips';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defringe, removeGapAt, removePieceAt, removeStrayBits, trimEdges, unmixEdges } from '@/lib/cutout/islands';
import { subtractBackground } from '@/lib/cutout/subtract';
import { showMessage } from '@/lib/dialogs';
import { toImageBlob } from '@/lib/web-image';

import type { CutoutStepProps } from './cutout-step';

const OUTPUT_MAX = 1024; // longest side of the saved picture
const WORK_MAX = 640; // longest side used for the automatic cut (faster, then scaled up)
const MAX_UNDO = 10;
const MAX_ZOOM = 8; // × the "fit" zoom
const STRAY_BIT = 0.05; // after erasing, pieces smaller than 5% of the main piece are removed

type Tool = 'erase' | 'restore' | 'wand' | 'gap' | 'move';
const LIFT = 60; // on phones, the brush sits this many pixels above the fingertip so you can see it
type Point = { x: number; y: number };
type View2D = { scale: number; x: number; y: number }; // screen = canvas * scale + (x, y)

/**
 * Full-screen web cut-out editor. Runs the custom background remover, then lets the user
 * fix the result with Erase / Restore brushes.
 *  - Pinch (two fingers) or the mouse wheel zooms; two fingers or the Move tool pans.
 *  - The brush size is in screen pixels, so zooming in gives a finer brush.
 *  - Wand: tap a separate piece (a leftover chunk of background) to delete all of it.
 *  - Gap: tap leftover background inside the outline (between legs, inside a strap) to clear
 *    that patch; it spreads over similar colour and stops at the garment's edge.
 *  - On phones the brush sits a little above the fingertip, so you can see what you erase.
 *  - After each Erase stroke, tiny pieces cut off from the main item are removed automatically.
 * The mask is an offscreen canvas the size of the output: white = keep, transparent = removed.
 */
export function CutoutStep({ photoUri, initialMaskUri, onDone, onCancel }: CutoutStepProps) {
  const theme = useTheme();
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<ImageData[]>([]);
  const frame = useRef<number | null>(null);
  const view = useRef<View2D>({ scale: 1, x: 0, y: 0 });
  const fitScale = useRef(1);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { kind: 'none' }
    | { kind: 'stroke'; last: Point }
    // A finger is down but hasn't moved yet: it may still become a pinch, so don't paint yet.
    | { kind: 'pending'; start: Point; brush: Point }
    | { kind: 'pan'; start: Point; from: View2D }
    | { kind: 'pinch'; dist: number; mid: Point; from: View2D }
  >({ kind: 'none' });

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState(28); // screen pixels
  const [tolerance, setTolerance] = useState(1);
  const [showRemoved, setShowRemoved] = useState(true);
  const [more, setMore] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [autoClean, setAutoClean] = useState(true);
  const [lift, setLift] = useState(true);
  const photoPixels = useRef<Uint8ClampedArray | null>(null); // for the Gap tool
  // Clean edges: a copy of the mask with the outline's background rim made see-through (colour
  // unmixing) and optionally shrunk by a pixel or two. It's what the preview shows and what is
  // saved, so no white edges are left around the garment.
  const [cleanEdges, setCleanEdges] = useState(true);
  const [edgeTrim, setEdgeTrim] = useState(0);
  const trimmed = useRef<HTMLCanvasElement | null>(null);
  const stroking = useRef(false);
  const [maskVersion, setMaskVersion] = useState(0);
  const maskChanged = () => setMaskVersion((v) => v + 1);
  const cancel = useEffectEvent(onCancel);

  // ---- drawing ----
  const redraw = useCallback(() => {
    const canvas = viewRef.current;
    if (!canvas || !photo.current || !mask.current || !scratch.current) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (showRemoved) {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(photo.current, 0, 0);
      ctx.globalAlpha = 1;
    }
    const s = scratch.current.getContext('2d')!;
    s.globalCompositeOperation = 'copy';
    s.drawImage(photo.current, 0, 0);
    s.globalCompositeOperation = 'destination-in';
    const useClean = (cleanEdges || edgeTrim > 0) && trimmed.current && !stroking.current;
    s.drawImage(useClean ? trimmed.current! : mask.current, 0, 0);
    ctx.drawImage(scratch.current, 0, 0);
  }, [showRemoved, edgeTrim, cleanEdges]);

  const scheduleRedraw = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      redraw();
    });
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw, ready]);

  // ---- zoom / pan ----
  function applyView(next: View2D) {
    view.current = next;
    const canvas = viewRef.current;
    if (canvas) canvas.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  }

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const canvas = viewRef.current;
    if (!vp || !canvas || !canvas.width) return;
    const pad = 16;
    const scale = Math.min((vp.clientWidth - pad * 2) / canvas.width, (vp.clientHeight - pad * 2) / canvas.height);
    fitScale.current = scale;
    applyView({
      scale,
      x: (vp.clientWidth - canvas.width * scale) / 2,
      y: (vp.clientHeight - canvas.height * scale) / 2,
    });
  }, []);

  /** Zooms so the canvas point under `screen` stays under it. */
  function zoomAround(screen: Point, from: View2D, scale: number) {
    const clamped = Math.min(fitScale.current * MAX_ZOOM, Math.max(fitScale.current * 0.5, scale));
    const cx = (screen.x - from.x) / from.scale;
    const cy = (screen.y - from.y) / from.scale;
    applyView({ scale: clamped, x: screen.x - cx * clamped, y: screen.y - cy * clamped });
  }

  // Re-fit when the window or phone rotates.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !ready) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(vp);
    return () => observer.disconnect();
  }, [ready, fit]);

  // ---- mask ----
  const fillMask = useCallback(() => {
    const m = mask.current!;
    const ctx = m.getContext('2d')!;
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, m.width, m.height);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  /** Runs the automatic cut at WORK_MAX resolution and scales the mask up. */
  const runAuto = useCallback(
    (tol: number) => {
      const src = photo.current!;
      const scale = Math.min(1, WORK_MAX / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const work = document.createElement('canvas');
      work.width = w;
      work.height = h;
      const wctx = work.getContext('2d', { willReadFrequently: true })!;
      wctx.drawImage(src, 0, 0, w, h);
      const pixels = wctx.getImageData(0, 0, w, h);
      const alpha = subtractBackground({ width: w, height: h, data: pixels.data }, { tolerance: tol });

      let kept = 0;
      for (let i = 0; i < alpha.length; i++) {
        pixels.data[i * 4] = 255;
        pixels.data[i * 4 + 1] = 255;
        pixels.data[i * 4 + 2] = 255;
        pixels.data[i * 4 + 3] = alpha[i];
        if (alpha[i] > 127) kept++;
      }

      undo.current = [];
      setUndoCount(0);
      if (kept < alpha.length * 0.01) {
        work.width = 0;
        work.height = 0;
        fillMask();
        setNote("Couldn't find the item automatically. Use Erase to remove the background by hand.");
        return;
      }
      wctx.putImageData(pixels, 0, 0);
      const mctx = mask.current!.getContext('2d')!;
      mctx.globalCompositeOperation = 'copy';
      mctx.imageSmoothingQuality = 'high';
      mctx.drawImage(work, 0, 0, mask.current!.width, mask.current!.height);
      mctx.globalCompositeOperation = 'source-over';
      // Enlarging the small mask smears its edge over ~7 pixels, which leaves a pale rim of
      // background. Sharpen it back to ~2 pixels: mostly-see-through → clear, mostly-solid → solid.
      const full = mctx.getImageData(0, 0, mask.current!.width, mask.current!.height);
      for (let i = 3; i < full.data.length; i += 4) full.data[i] = Math.min(255, Math.max(0, (full.data[i] - 96) * 4));
      mctx.putImageData(full, 0, 0);
      work.width = 0; // free its memory now
      work.height = 0;
      setNote(null);
    },
    [fillMask],
  );

  // Load the photo, then either keep its existing transparency or run the automatic cut.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = photoUri;
    img
      .decode()
      .then(async () => {
        if (cancelled) return;
        const scale = Math.min(1, OUTPUT_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const make = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          return c;
        };
        photo.current = make();
        mask.current = make();
        scratch.current = make();
        const pctx = photo.current.getContext('2d', { willReadFrequently: true })!;
        pctx.drawImage(img, 0, 0, w, h);
        if (viewRef.current) {
          viewRef.current.width = w;
          viewRef.current.height = h;
        }

        const { data } = pctx.getImageData(0, 0, w, h);
        photoPixels.current = data;
        if (initialMaskUri) {
          // Editing a cut-out again: bring back the mask exactly as it was.
          const m = new Image();
          m.src = initialMaskUri;
          await m.decode();
          if (cancelled) return;
          const mctx = mask.current.getContext('2d')!;
          mctx.clearRect(0, 0, w, h);
          mctx.drawImage(m, 0, 0, w, h);
          fit();
          setReady(true);
          return;
        }
        // An imported PNG that is already cut out: use it as is.
        let transparent = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
        if (transparent > w * h * 0.02) {
          fillMask();
          setNote('This image already has a transparent background. Touch it up if needed.');
        } else {
          runAuto(1);
        }
        fit();
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        showMessage('Could not open this image', 'Try a JPG or PNG photo.');
        cancel();
      });
    return () => {
      cancelled = true;
    };
  }, [photoUri, initialMaskUri, runAuto, fillMask, fit]);

  // iPhone Safari has a small, hard limit on memory for pictures being edited ("canvases"). Free
  // ours when the editor closes, or after a few items saving can get stuck and taps feel slow.
  useEffect(() => {
    const view = viewRef.current;
    return () => {
      for (const c of [photo.current, mask.current, scratch.current, trimmed.current, view]) {
        if (c) {
          c.width = 0;
          c.height = 0;
        }
      }
      undo.current = [];
      photoPixels.current = null;
    };
  }, []);

  // Rebuild the trimmed mask whenever the mask (or the trim amount) changes, then repaint.
  useEffect(() => {
    const m = mask.current;
    if (!ready || !m || !m.width) return;
    if (cleanEdges || edgeTrim > 0) {
      if (!trimmed.current) trimmed.current = document.createElement('canvas');
      const t = trimmed.current;
      t.width = m.width;
      t.height = m.height;
      const img = m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height);
      if (cleanEdges && photoPixels.current) unmixEdges(img.data, photoPixels.current, m.width, m.height);
      trimEdges(img.data, m.width, m.height, edgeTrim);
      t.getContext('2d')!.putImageData(img, 0, 0);
    }
    redraw();
  }, [maskVersion, edgeTrim, cleanEdges, ready, redraw]);

  function rerunAuto(tol: number) {
    setBusy(true);
    // Let the spinner paint before the (synchronous) cut runs.
    setTimeout(() => {
      runAuto(tol);
      setBusy(false);
      maskChanged();
    }, 20);
  }

  function keepWholePhoto() {
    pushUndo();
    fillMask();
    setNote(null);
    maskChanged();
  }

  function pushUndo() {
    const m = mask.current!;
    undo.current.push(m.getContext('2d')!.getImageData(0, 0, m.width, m.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
  }

  function popUndo() {
    const last = undo.current.pop();
    if (!last) return;
    mask.current!.getContext('2d')!.putImageData(last, 0, 0);
    setUndoCount(undo.current.length);
    maskChanged();
  }

  /** Runs `change` on the mask's pixels; writes them back if anything was removed. */
  function editMask(change: (rgba: Uint8ClampedArray, w: number, h: number) => number) {
    const m = mask.current!;
    const ctx = m.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, m.width, m.height);
    const removed = change(img.data, m.width, m.height);
    if (removed > 0) {
      ctx.putImageData(img, 0, 0);
      maskChanged();
    }
    return removed;
  }

  // ---- pointer handling: 1 finger = brush (or pan with Move), 2 fingers = pinch + pan ----
  function local(e: { clientX: number; clientY: number }): Point {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function toCanvas(p: Point): Point {
    const v = view.current;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  }

  function paint(from: Point, to: Point) {
    const m = mask.current!;
    const ctx = m.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush / view.current.scale; // constant size on screen
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    scheduleRedraw();
  }

  /** Shows the brush outline under the mouse / finger. */
  function moveCursor(p: Point | null) {
    const c = cursorRef.current;
    if (!c) return;
    if (!p || tool === 'move' || tool === 'wand' || tool === 'gap') {
      c.style.display = 'none';
      return;
    }
    c.style.display = 'block';
    c.style.transform = `translate(${p.x - brush / 2}px, ${p.y - brush / 2}px)`;
  }

  function pinchInfo() {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!ready || busy) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves if the finger leaves the photo
    } catch {
      // Not every pointer can be captured; tracking still works without it.
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 2) {
      // A second finger means a pinch. Usually the first finger hasn't painted yet (pending),
      // so nothing needs undoing; only a stroke that already started is rolled back.
      if (gesture.current.kind === 'stroke') {
        stroking.current = false;
        popUndo();
      }
      gesture.current = { kind: 'pinch', ...pinchInfo(), from: view.current };
      moveCursor(null);
      return;
    }
    if (pointers.current.size > 2) return;

    if (tool === 'move' || e.button === 1) {
      gesture.current = { kind: 'pan', start: p, from: view.current };
    } else if (tool === 'wand') {
      pushUndo();
      const c = toCanvas(p);
      if (editMask((rgba, w, h) => removePieceAt(rgba, w, h, c.x, c.y)) === 0) popUndo(); // tapped nothing
      gesture.current = { kind: 'none' };
    } else if (tool === 'gap') {
      pushUndo();
      const c = toCanvas(p);
      const pixels = photoPixels.current;
      const removed = pixels ? editMask((rgba, w, h) => removeGapAt(rgba, pixels, w, h, c.x, c.y, tolerance)) : 0;
      if (removed === 0) popUndo();
      gesture.current = { kind: 'none' };
    } else {
      // Wait for the finger to move before painting (see onPointerMove), so starting a pinch
      // doesn't touch the picture.
      gesture.current = { kind: 'pending', start: p, brush: toCanvas(brushPoint(e, p)) };
    }
  }

  /** Begins a brush stroke at `from` (saving an Undo step first). */
  function startStroke(from: Point) {
    pushUndo();
    stroking.current = true; // show the live mask while painting; the cleaned one after
    gesture.current = { kind: 'stroke', last: from };
    paint(from, from);
  }

  /** Where the brush paints: on phones (touch), a little above the fingertip so it's visible. */
  function brushPoint(e: PointerEvent<HTMLDivElement>, p: Point): Point {
    return e.pointerType === 'touch' && lift ? { x: p.x, y: p.y - LIFT } : p;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = local(e);
    if (e.pointerType === 'mouse' || gesture.current.kind === 'stroke' || gesture.current.kind === 'pending')
      moveCursor(brushPoint(e, p));
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    let g = gesture.current;
    if (g.kind === 'pending' && pointers.current.size === 1 && Math.hypot(p.x - g.start.x, p.y - g.start.y) > 4) {
      startStroke(g.brush); // it really is a brush stroke
      g = gesture.current;
    }
    if (g.kind === 'stroke') {
      const c = toCanvas(brushPoint(e, p));
      paint(g.last, c);
      g.last = c;
    } else if (g.kind === 'pan') {
      applyView({ ...g.from, x: g.from.x + p.x - g.start.x, y: g.from.y + p.y - g.start.y });
    } else if (g.kind === 'pinch' && pointers.current.size === 2) {
      const { dist, mid } = pinchInfo();
      // Zoom around where the fingers started, then follow them as they move.
      zoomAround(g.mid, g.from, g.from.scale * (dist / g.dist));
      applyView({ ...view.current, x: view.current.x + mid.x - g.mid.x, y: view.current.y + mid.y - g.mid.y });
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    // A tap without moving paints a single dot.
    const g = gesture.current;
    if (g.kind === 'pending' && pointers.current.size === 0) startStroke(g.brush);
    if (stroking.current && (pointers.current.size === 0 || gesture.current.kind === 'pinch')) {
      stroking.current = false;
      maskChanged();
    }
    // An Erase stroke may have cut small bits off the item: clear them (part of the same Undo step).
    if (gesture.current.kind === 'stroke' && tool === 'erase' && autoClean && pointers.current.size === 0) {
      editMask((rgba, w, h) => removeStrayBits(rgba, w, h, STRAY_BIT));
    }
    // After a pinch, wait until every finger is lifted before brushing again.
    if (pointers.current.size === 0 || gesture.current.kind === 'pinch') gesture.current = { kind: 'none' };
    if (e.pointerType !== 'mouse') moveCursor(null);
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!ready) return;
    zoomAround(local(e), view.current, view.current.scale * Math.exp(-e.deltaY * 0.0015));
  }

  function zoomBy(factor: number) {
    const vp = viewportRef.current!;
    zoomAround({ x: vp.clientWidth / 2, y: vp.clientHeight / 2 }, view.current, view.current.scale * factor);
  }

  /** Crops to the kept area and hands back the picture (WebP, or PNG on iPhone Safari) as a blob URL. */
  function finish() {
    // The saved picture uses the trimmed outline (no rim of background).
    const m = (cleanEdges || edgeTrim > 0) && trimmed.current ? trimmed.current : mask.current!;
    const { data } = m.getContext('2d')!.getImageData(0, 0, m.width, m.height);
    let minX = m.width;
    let minY = m.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (data[(y * m.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      showMessage('Nothing is left', 'Use Restore or "Keep whole photo" to bring the item back.');
      return;
    }
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(m.width - 1, maxX + pad);
    maxY = Math.min(m.height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(photo.current!, minX, minY, w, h, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m, minX, minY, w, h, 0, 0, w, h);
    // Soft edge pixels take the garment's colour instead of the background's (no white halo).
    const edged = ctx.getImageData(0, 0, w, h);
    defringe(edged.data, w, h);
    ctx.globalCompositeOperation = 'copy';
    ctx.putImageData(edged, 0, 0);
    // The mask is handed back too, so "Edit cut-out again" can continue exactly where this left off.
    Promise.all([
      toImageBlob(out, 0.9),
      new Promise<Blob | null>((resolve) => m.toBlob(resolve, 'image/png')),
    ])
      .then(([blob, maskBlob]) => {
        out.width = 0; // free the canvas memory right away (see the clean-up effect above)
        out.height = 0;
        onDone(URL.createObjectURL(blob), maskBlob ? URL.createObjectURL(maskBlob) : undefined);
      })
      .catch((e) => showMessage('Could not create the image', e.message));
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { borderColor: theme.backgroundElement }]}>
        <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.barButton, { color: theme.tint }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: theme.text }]}>Cut out</Text>
        <Pressable onPress={finish} disabled={!ready || busy} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.barButton, styles.bold, { color: theme.tint, opacity: ready && !busy ? 1 : 0.4 }]}>
            Done
          </Text>
        </Pressable>
      </View>

      {/* The photo: pinch or mouse wheel to zoom, two fingers or Move to pan */}
      <div
        ref={viewportRef}
        data-testid="cutout-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') moveCursor(null);
        }}
        onWheel={onWheel}
        style={{
          ...checkerboard(theme.backgroundElement),
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: tool === 'move' ? 'grab' : tool === 'wand' ? 'crosshair' : 'none',
        }}>
        <canvas
          ref={viewRef}
          style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', pointerEvents: 'none' }}
        />
        <div
          ref={cursorRef}
          style={{
            display: 'none',
            position: 'absolute',
            left: 0,
            top: 0,
            width: brush,
            height: brush,
            borderRadius: '50%',
            border: `2px solid ${tool === 'erase' ? '#ff4d4d' : '#2ecc71'}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        />
        {!ready || busy ? (
          <View style={styles.overlay}>
            <ActivityIndicator />
            <Text style={{ color: theme.textSecondary }}>Removing background…</Text>
          </View>
        ) : null}
        {note ? (
          <View style={[styles.note, { backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>{note}</Text>
          </View>
        ) : null}
      </div>

      {/* Toolbar at the bottom, within thumb reach */}
      <View style={[styles.toolbar, { borderColor: theme.backgroundElement }]}>
        <View style={styles.row}>
          <Chip text="Erase" selected={tool === 'erase'} onPress={() => setTool('erase')} />
          <Chip text="Restore" selected={tool === 'restore'} onPress={() => setTool('restore')} />
          <Chip text="🪄 Wand" selected={tool === 'wand'} onPress={() => setTool('wand')} />
          <Chip text="🎯 Gap" selected={tool === 'gap'} onPress={() => setTool('gap')} />
          <Chip text="Move" selected={tool === 'move'} onPress={() => setTool('move')} />
          <Chip text={`Undo${undoCount ? ` (${undoCount})` : ''}`} selected={false} onPress={popUndo} />
        </View>
        <View style={styles.row}>
          <Chip text="−" selected={false} onPress={() => zoomBy(1 / 1.5)} />
          <Chip text="Fit" selected={false} onPress={fit} />
          <Chip text="+" selected={false} onPress={() => zoomBy(1.5)} />
          <Slider label="Brush size" min={8} max={80} step={1} value={brush} onChange={setBrush} />
        </View>
        <Pressable onPress={() => setMore((m) => !m)} hitSlop={6} accessibilityRole="button">
          <Text style={[styles.moreToggle, { color: theme.tint }]}>
            {more ? 'Fewer options ▴' : 'More options ▾'}
          </Text>
        </Pressable>
        {more ? (
          <View style={styles.more}>
            <Slider
              label="Auto-cut: keep more ↔ remove more"
              min={0.5}
              max={2}
              step={0.1}
              value={tolerance}
              onChange={setTolerance}
              onCommit={rerunAuto}
            />
            <View style={styles.row}>
              <Chip text="Redo auto-cut" selected={false} onPress={() => rerunAuto(tolerance)} />
              <Chip text="Keep whole photo" selected={false} onPress={keepWholePhoto} />
              <Chip text="Show removed" selected={showRemoved} onPress={() => setShowRemoved((v) => !v)} />
              <Chip text="Brush above finger" selected={lift} onPress={() => setLift((v) => !v)} />
            </View>
            <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>
              White edges: clean-up {cleanEdges ? 'on' : 'off'}, extra trim {edgeTrim === 0 ? 'none' : `${edgeTrim} px`}
            </Text>
            <View style={styles.row}>
              <Chip text="✨ Clean edges" selected={cleanEdges} onPress={() => setCleanEdges((v) => !v)} />
              {[0, 1, 2, 3].map((px) => (
                <Chip key={px} text={px === 0 ? 'No trim' : `Trim ${px} px`} selected={edgeTrim === px} onPress={() => setEdgeTrim(px)} />
              ))}
              <Chip
                text="Auto-remove stray bits"
                selected={autoClean}
                onPress={() => setAutoClean((v) => !v)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  /** Called when the user lets go of the slider. */
  onCommit?: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.slider}>
      <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>{label}</Text>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        style={{ width: '100%', accentColor: theme.tint }}
      />
    </View>
  );
}

/** Gray/white squares behind the picture so transparent areas are visible. */
function checkerboard(color: string) {
  return {
    backgroundColor: '#fff',
    backgroundImage: `conic-gradient(${color} 25%, transparent 0 50%, ${color} 0 75%, transparent 0)`,
    backgroundSize: '24px 24px',
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  barButton: { fontSize: 17 },
  bold: { fontWeight: '700' },
  barTitle: { fontSize: 17, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  note: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    top: Spacing.three,
    padding: Spacing.two,
    borderRadius: 10,
    opacity: 0.92,
  },
  toolbar: { padding: Spacing.three, gap: Spacing.two, borderTopWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  slider: { flex: 1, minWidth: 120, gap: 2 },
  sliderLabel: { fontSize: 12, fontWeight: '600' },
  moreToggle: { fontSize: 14, fontWeight: '600' },
  more: { gap: Spacing.two },
});
