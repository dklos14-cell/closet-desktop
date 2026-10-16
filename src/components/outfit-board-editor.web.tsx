import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chips';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BOARD_ASPECT, type Layout } from '@/lib/outfit-board';

import type { OutfitBoardEditorProps } from './outfit-board-editor';

type Point = { x: number; y: number };
type Gesture =
  | { kind: 'none' }
  | { kind: 'drag'; id: string; start: Point; from: Layout }
  | { kind: 'pinch'; id: string; dist: number; angle: number; from: Layout };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Outfit board editor for the web. Tap a piece to select it, then:
 *  - drag it with one finger / the mouse,
 *  - pinch with two fingers to resize and twist to rotate (or use the buttons / mouse wheel).
 */
export function OutfitBoardEditor({ items, layouts, onChange, onAutoArrange, onRemove }: OutfitBoardEditorProps) {
  const theme = useTheme();
  const boardRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: 'none' });
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

  const bringTo = (id: string, where: 'front' | 'back') => {
    const zs = [...layouts.values()].map((l) => l.z);
    setLayout(id, { z: where === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
  };

  function local(e: { clientX: number; clientY: number }): Point {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function twoFingers() {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Tracking still works without capture.
    }
    pointers.current.set(e.pointerId, local(e));
    const hitId = (e.target as HTMLElement).closest<HTMLElement>('[data-piece]')?.dataset.piece ?? null;

    if (pointers.current.size === 2 && (selected || hitId)) {
      const id = selected ?? hitId!;
      gesture.current = { kind: 'pinch', id, ...twoFingers(), from: layouts.get(id)! };
      return;
    }
    if (pointers.current.size > 1) return;
    if (!hitId) {
      setSelected(null);
      gesture.current = { kind: 'none' };
      return;
    }
    setSelected(hitId);
    gesture.current = { kind: 'drag', id: hitId, start: local(e), from: layouts.get(hitId)! };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const board = boardRef.current!;
    if (g.kind === 'drag') {
      const p = local(e);
      setLayout(g.id, {
        x: g.from.x + (p.x - g.start.x) / board.clientWidth,
        y: g.from.y + (p.y - g.start.y) / board.clientHeight,
      });
    } else if (g.kind === 'pinch' && pointers.current.size === 2) {
      const { dist, angle } = twoFingers();
      setLayout(g.id, { scale: g.from.scale * (dist / g.dist), rotation: g.from.rotation + angle - g.angle });
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 || gesture.current.kind === 'pinch') gesture.current = { kind: 'none' };
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!selected) return;
    const l = layouts.get(selected)!;
    setLayout(selected, { scale: l.scale * Math.exp(-e.deltaY * 0.0015) });
  }

  const ordered = [...items].sort((a, b) => layouts.get(a.id)!.z - layouts.get(b.id)!.z);
  const sel = selected ? layouts.get(selected) : undefined;

  return (
    <View style={styles.wrap}>
      <div
        ref={boardRef}
        data-testid="outfit-board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(BOARD_ASPECT),
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.backgroundElement,
          touchAction: 'none',
          userSelect: 'none',
        }}>
        {ordered.map((item) => {
          const l = layouts.get(item.id)!;
          const isSel = item.id === selected;
          return (
            <div
              key={item.id}
              data-piece={item.id}
              style={{
                position: 'absolute',
                left: `${l.x * 100}%`,
                top: `${l.y * 100}%`,
                width: `${l.scale * 100}%`,
                aspectRatio: '1',
                transform: `translate(-50%, -50%) rotate(${l.rotation}deg)`,
                outline: isSel ? `2px dashed ${theme.tint}` : 'none',
                outlineOffset: 2,
                borderRadius: 8,
                cursor: 'grab',
              }}>
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              ) : null}
            </div>
          );
        })}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.textSecondary }}>Add pieces from your closet to build the look.</Text>
          </View>
        ) : null}
      </div>

      {sel && selected ? (
        <View style={styles.row}>
          <Chip text="Done" selected onPress={() => setSelected(null)} />
          <Chip text="−" selected={false} onPress={() => setLayout(selected, { scale: sel.scale / 1.15 })} />
          <Chip text="+" selected={false} onPress={() => setLayout(selected, { scale: sel.scale * 1.15 })} />
          <Chip text="⟲" selected={false} onPress={() => setLayout(selected, { rotation: sel.rotation - 15 })} />
          <Chip text="⟳" selected={false} onPress={() => setLayout(selected, { rotation: sel.rotation + 15 })} />
          <Chip text="To front" selected={false} onPress={() => bringTo(selected, 'front')} />
          <Chip text="To back" selected={false} onPress={() => bringTo(selected, 'back')} />
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
          Tap a piece to move it. Pinch to resize, twist to rotate.
        </Text>
      )}
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

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
