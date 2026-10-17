import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { StyleSheet, Text, View } from "react-native";

import { Chip } from "@/components/chips";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { isTyping } from "@/lib/keys";
import { BOARD_ASPECT, type Layout } from "@/lib/outfit-board";
import { pictureOf } from "@/components/outfit-board";

import type { OutfitBoardEditorProps } from "./outfit-board-editor";

type Point = { x: number; y: number };
type Gesture =
  | { kind: "none" }
  | { kind: "drag"; id: string; start: Point; from: Layout }
  | { kind: "pinch"; id: string; dist: number; angle: number; from: Layout }
  | { kind: "resize"; id: string; startDist: number; from: Layout }
  | { kind: "rotate"; id: string; startAngle: number; from: Layout };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Outfit board editor. Click a piece to select it, then:
 *  - drag it to move it,
 *  - drag the square in its corner to resize it, or the ring in its middle to turn it,
 *  - pinch on the trackpad to resize, or use the buttons / keyboard shortcuts.
 */
export function OutfitBoardEditor({
  items,
  layouts,
  onChange,
  onAutoArrange,
  onRemove,
}: OutfitBoardEditorProps) {
  const theme = useTheme();
  const boardRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);

  const setLayout = (id: string, patch: Partial<Layout>) => {
    const next = new Map(layouts);
    const l = next.get(id)!;
    const merged = { ...l, ...patch };
    next.set(id, {
      ...merged,
      x: clamp(merged.x, 0, 1),
      y: clamp(merged.y, 0, 1),
      scale: clamp(merged.scale, 0.08, 1.2),
      rotation: ((merged.rotation + 540) % 360) - 180,
    });
    onChange(next);
  };

  const bringTo = (id: string, where: "front" | "back") => {
    const zs = [...layouts.values()].map((l) => l.z);
    setLayout(id, {
      z: where === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1,
    });
  };

  /** Shows the item's next photo (main → extra angles → main). */
  const nextAngle = (id: string) => {
    const count = items.find((it) => it.id === id)?.angleUrls?.length ?? 1;
    if (count > 1) setLayout(id, { angle: ((layouts.get(id)!.angle ?? 0) + 1) % count });
  };

  function local(e: { clientX: number; clientY: number }): Point {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function centerOf(l: Layout): Point {
    const board = boardRef.current!;
    return { x: l.x * board.clientWidth, y: l.y * board.clientHeight };
  }

  const angleOf = (c: Point, p: Point) =>
    (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;

  function twoFingers() {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Tracking still works without capture.
    }
    pointers.current.set(e.pointerId, local(e));
    const target = e.target as Element;
    const hitId =
      target.closest<HTMLElement>("[data-piece]")?.dataset.piece ?? null;
    const handle = target
      .closest<Element>("[data-handle]")
      ?.getAttribute("data-handle");
    if (hitId && handle && pointers.current.size === 1) {
      const from = layouts.get(hitId)!;
      const p = local(e);
      const c = centerOf(from);
      gesture.current =
        handle === "resize"
          ? {
              kind: "resize",
              id: hitId,
              startDist: Math.max(1, Math.hypot(p.x - c.x, p.y - c.y)),
              from,
            }
          : { kind: "rotate", id: hitId, startAngle: angleOf(c, p), from };
      return;
    }

    if (pointers.current.size === 2 && (selected || hitId)) {
      const id = selected ?? hitId!;
      gesture.current = {
        kind: "pinch",
        id,
        ...twoFingers(),
        from: layouts.get(id)!,
      };
      return;
    }
    if (pointers.current.size > 1) return;
    if (!hitId) {
      setSelected(null);
      gesture.current = { kind: "none" };
      return;
    }
    setSelected(hitId);
    gesture.current = {
      kind: "drag",
      id: hitId,
      start: local(e),
      from: layouts.get(hitId)!,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const board = boardRef.current!;
    if (g.kind === "drag") {
      const p = local(e);
      setLayout(g.id, {
        x: g.from.x + (p.x - g.start.x) / board.clientWidth,
        y: g.from.y + (p.y - g.start.y) / board.clientHeight,
      });
    } else if (g.kind === "pinch" && pointers.current.size === 2) {
      const { dist, angle } = twoFingers();
      setLayout(g.id, {
        scale: g.from.scale * (dist / g.dist),
        rotation: g.from.rotation + angle - g.angle,
      });
    } else if (g.kind === "resize") {
      const p = local(e);
      const c = centerOf(g.from);
      setLayout(g.id, {
        scale: g.from.scale * (Math.hypot(p.x - c.x, p.y - c.y) / g.startDist),
      });
    } else if (g.kind === "rotate") {
      let rotation =
        g.from.rotation + angleOf(centerOf(g.from), local(e)) - g.startAngle;
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15; // Shift: snap to 15° steps
      setLayout(g.id, { rotation });
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 || gesture.current.kind === "pinch")
      gesture.current = { kind: "none" };
  }

  // Trackpad pinch (or ⌘/Ctrl + wheel) resizes the selected piece; plain scrolling scrolls the page.
  const onWheel = useEffectEvent((e: globalThis.WheelEvent) => {
    if (!selected || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const l = layouts.get(selected)!;
    setLayout(selected, {
      scale: l.scale * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.01),
    });
  });
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const listener = (e: globalThis.WheelEvent) => onWheel(e);
    board.addEventListener("wheel", listener, { passive: false });
    return () => board.removeEventListener("wheel", listener);
  }, []);

  // Keyboard, while a piece is selected (listed under the board).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!selected || isTyping(e)) return;
    const l = layouts.get(selected);
    if (!l) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    else if (k === "f" || k === "F") bringTo(selected, "front");
    else if (k === "h" || k === "H") setLayout(selected, { flip: !l.flip });
    else if (k === "v" || k === "V") nextAngle(selected);
    else if (k === "b" || k === "B") bringTo(selected, "back");
    else if (k === "ArrowLeft") setLayout(selected, { x: l.x - step });
    else if (k === "ArrowRight") setLayout(selected, { x: l.x + step });
    else if (k === "ArrowUp") setLayout(selected, { y: l.y - step });
    else if (k === "ArrowDown") setLayout(selected, { y: l.y + step });
    else if (k === "=" || k === "+")
      setLayout(selected, { scale: l.scale * 1.1 });
    else if (k === "-") setLayout(selected, { scale: l.scale / 1.1 });
    else if (k === "[")
      setLayout(selected, { rotation: l.rotation - (e.shiftKey ? 1 : 15) });
    else if (k === "]")
      setLayout(selected, { rotation: l.rotation + (e.shiftKey ? 1 : 15) });
    else if ((k === "Backspace" || k === "Delete") && onRemove) {
      onRemove(selected);
      setSelected(null);
    } else if (k === "Escape" || k === "Enter") setSelected(null);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    // Capture: runs before the app-wide Esc (= Cancel), so Esc only deselects the piece.
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  const ordered = [...items].sort(
    (a, b) => layouts.get(a.id)!.z - layouts.get(b.id)!.z,
  );
  const sel = selected ? layouts.get(selected) : undefined;

  return (
    <View style={styles.wrap}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ position: "relative", width: "100%" }}
      >
        <div
          ref={boardRef}
          data-testid="outfit-board"
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: String(BOARD_ASPECT),
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: theme.backgroundElement,
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {ordered.map((item) => {
            const l = layouts.get(item.id)!;
            const isSel = item.id === selected;
            return (
              <div
                key={item.id}
                data-piece={item.id}
                style={{
                  position: "absolute",
                  left: `${l.x * 100}%`,
                  top: `${l.y * 100}%`,
                  width: `${l.scale * 100}%`,
                  aspectRatio: "1",
                  transform: `translate(-50%, -50%) rotate(${l.rotation}deg)${l.flip ? " scaleX(-1)" : ""}`,
                  outline: isSel ? `2px dashed ${theme.tint}` : "none",
                  outlineOffset: 2,
                  borderRadius: 8,
                  cursor: "move",
                }}
              >
                {pictureOf(item, l) ? (
                  <img
                    src={pictureOf(item, l)!}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ color: theme.textSecondary }}>
                Add pieces from your closet to build the look.
              </Text>
            </View>
          ) : null}
        </div>
        {/* The selected piece's handles, on a layer that isn't clipped by the board's edge. */}
        {sel && selected ? (
          <div
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <div
              data-piece={selected}
              style={{
                position: "absolute",
                left: `${sel.x * 100}%`,
                top: `${sel.y * 100}%`,
                width: `${sel.scale * 100}%`,
                aspectRatio: "1",
                transform: `translate(-50%, -50%) rotate(${sel.rotation}deg)`,
              }}
            >
              <Handles color={theme.tint} />
            </div>
          </div>
        ) : null}
      </div>

      {sel && selected ? (
        <View style={styles.row}>
          <Chip text="Done" selected onPress={() => setSelected(null)} />
          <Chip
            text="−"
            selected={false}
            onPress={() => setLayout(selected, { scale: sel.scale / 1.15 })}
          />
          <Chip
            text="+"
            selected={false}
            onPress={() => setLayout(selected, { scale: sel.scale * 1.15 })}
          />
          <Chip
            text="⟲"
            selected={false}
            onPress={() => setLayout(selected, { rotation: sel.rotation - 15 })}
          />
          <Chip
            text="⟳"
            selected={false}
            onPress={() => setLayout(selected, { rotation: sel.rotation + 15 })}
          />
          {(items.find((it) => it.id === selected)?.angleUrls?.length ?? 1) > 1 ? (
            <Chip
              text={`🔄 Angle ${(sel.angle ?? 0) + 1}/${items.find((it) => it.id === selected)!.angleUrls!.length} (V)`}
              selected={false}
              onPress={() => nextAngle(selected)}
            />
          ) : null}
          <Chip
            text="⇋ Flip (H)"
            selected={!!sel.flip}
            onPress={() => setLayout(selected, { flip: !sel.flip })}
          />
          <Chip
            text="To front"
            selected={false}
            onPress={() => bringTo(selected, "front")}
          />
          <Chip
            text="To back"
            selected={false}
            onPress={() => bringTo(selected, "back")}
          />
          {onRemove ? (
            <Chip
              text="Remove from outfit"
              selected={false}
              onPress={() => {
                onRemove(selected);
                setSelected(null);
              }}
            />
          ) : null}
        </View>
      ) : (
        <Text style={{ color: theme.textSecondary }}>
          Click a piece to select it, then drag it to move it.
        </Text>
      )}
      {sel ? (
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          Drag the corner square to resize, the middle ring to turn (Shift snaps
          to 15°), or pinch to resize · arrows move (Shift: faster) · + − size ·
          [ ] turn · V angle · H flip · F / B to front / back · Delete removes · Esc done
        </Text>
      ) : null}
      <View style={styles.row}>
        <Chip
          text="Auto-arrange"
          selected={false}
          onPress={() => {
            setSelected(null);
            onAutoArrange();
          }}
        />
      </View>
    </View>
  );
}

/** The selected piece's resize square (bottom-right corner) and turning ring (middle). */
function Handles({ color }: { color: string }) {
  return (
    <>
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          left: "25%",
          top: "25%",
          width: "50%",
          height: "50%",
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {/* Only the ring itself catches the mouse; inside it, dragging moves the piece. */}
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="transparent"
          strokeWidth="16"
          data-handle="rotate"
          style={{ pointerEvents: "stroke", cursor: "grab" }}
        />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray="6 5"
          style={{ pointerEvents: "none" }}
        />
        <circle
          cx="50"
          cy="4"
          r="5"
          fill="#fff"
          stroke={color}
          strokeWidth="3"
          style={{ pointerEvents: "none" }}
        />
      </svg>
      <div
        data-handle="resize"
        title="Drag to resize"
        style={{
          pointerEvents: "auto",
          position: "absolute",
          right: -9,
          bottom: -9,
          width: 16,
          height: 16,
          borderRadius: 3,
          background: "#fff",
          border: `3px solid ${color}`,
          cursor: "nwse-resize",
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  empty: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
