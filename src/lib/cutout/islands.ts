/**
 * Helpers for the cut-out mask (RGBA pixels; alpha = how much of the photo is kept).
 * A "piece" is a group of kept pixels touching each other (up/down/left/right).
 */

const KEPT = 32; // alpha above this counts as kept

/** Labels every kept piece. labels[i] = piece number (or -1); sizes[n] = pixels in piece n. */
function pieces(rgba: Uint8ClampedArray, width: number, height: number) {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1 || rgba[start * 4 + 3] <= KEPT) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % width;
      // Push each kept, unlabeled neighbour (written out for speed on phones).
      let j = i - 1;
      if (x > 0 && labels[j] === -1 && rgba[j * 4 + 3] > KEPT) {
        labels[j] = id;
        stack[top++] = j;
      }
      j = i + 1;
      if (x < width - 1 && labels[j] === -1 && rgba[j * 4 + 3] > KEPT) {
        labels[j] = id;
        stack[top++] = j;
      }
      j = i - width;
      if (j >= 0 && labels[j] === -1 && rgba[j * 4 + 3] > KEPT) {
        labels[j] = id;
        stack[top++] = j;
      }
      j = i + width;
      if (j < n && labels[j] === -1 && rgba[j * 4 + 3] > KEPT) {
        labels[j] = id;
        stack[top++] = j;
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/**
 * Deletes kept pieces smaller than `minFraction` of the biggest piece (leftovers from a missed
 * erase). Changes `rgba` in place; returns how many pixels were removed.
 */
export function removeStrayBits(rgba: Uint8ClampedArray, width: number, height: number, minFraction: number) {
  const { labels, sizes } = pieces(rgba, width, height);
  if (sizes.length < 2) return 0;
  const min = Math.max(...sizes) * minFraction;
  let removed = 0;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l >= 0 && sizes[l] < min) {
      rgba[i * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

/** Magic wand: deletes the whole piece under (x, y). Returns how many pixels were removed. */
export function removePieceAt(rgba: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  const { labels } = pieces(rgba, width, height);
  const target = labels[py * width + px];
  if (target < 0) return 0;
  let removed = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === target) {
      rgba[i * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

/**
 * Gap tool: removes the patch of leftover background around (x, y), e.g. the floor showing
 * between two trouser legs. Starting from the tapped spot it spreads to neighbouring kept pixels
 * whose colour (in the original `photo`) is close to the tapped colour, and stops where the
 * colour changes: at the garment's edge. `tolerance` 1 = normal, higher = takes more.
 * Changes `mask` in place; returns how many pixels were removed.
 */
export function removeGapAt(
  mask: Uint8ClampedArray,
  photo: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance = 1,
): number {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  const n = width * height;

  // The tapped colour: average of a small square around the tap (ignores fabric texture).
  let sl = 0;
  let sa = 0;
  let sb = 0;
  let count = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const xx = px + dx;
      const yy = py + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const [l, a, b] = lab(photo, (yy * width + xx) * 4);
      sl += l;
      sa += a;
      sb += b;
      count++;
    }
  }
  sl /= count;
  sa /= count;
  sb /= count;

  // Brightness may vary more (shadows, creases) than hue before a pixel counts as different.
  const close = (i: number) => {
    const [l, a, b] = lab(photo, i * 4);
    return Math.hypot((l - sl) / (12 * tolerance), (a - sa) / (6 * tolerance), (b - sb) / (6 * tolerance)) < 1;
  };

  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const start = py * width + px;
  if (mask[start * 4 + 3] <= KEPT || !close(start)) return 0;
  stack[top++] = start;
  seen[start] = 1;
  let removed = 0;
  while (top > 0) {
    const i = stack[--top];
    mask[i * 4 + 3] = 0;
    removed++;
    const cx = i % width;
    const neighbours = [cx > 0 ? i - 1 : -1, cx < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const j of neighbours) {
      if (j < 0 || j >= n || seen[j]) continue;
      seen[j] = 1;
      if (mask[j * 4 + 3] > KEPT && close(j)) stack[top++] = j;
    }
  }
  return removed;
}

/** sRGB pixel at byte offset `o` → CIE Lab. */
function lab(rgba: Uint8ClampedArray, o: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(rgba[o]);
  const g = lin(rgba[o + 1]);
  const b = lin(rgba[o + 2]);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Edge trim: shrinks the kept area by `px` pixels all round (each pixel's alpha becomes the
 * smallest alpha around it). Shaves off the thin rim of background colour a cut-out keeps
 * along its outline. Changes `rgba` in place.
 */
export function trimEdges(rgba: Uint8ClampedArray, width: number, height: number, px: number) {
  if (px <= 0) return;
  const n = width * height;
  let alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alpha[i] = rgba[i * 4 + 3];
  for (let pass = 0; pass < px; pass++) {
    // 3x3 minimum, as a row pass then a column pass.
    const rows = new Uint8ClampedArray(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        rows[i] = Math.min(alpha[i], x > 0 ? alpha[i - 1] : 0, x < width - 1 ? alpha[i + 1] : 0);
      }
    }
    const out = new Uint8ClampedArray(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        out[i] = Math.min(rows[i], y > 0 ? rows[i - width] : 0, y < height - 1 ? rows[i + width] : 0);
      }
    }
    alpha = out;
  }
  for (let i = 0; i < n; i++) rgba[i * 4 + 3] = alpha[i];
}

/**
 * Edge colour clean-up for a finished cut-out (photo colours + alpha in one RGBA image): soft
 * edge pixels are partly background, so on a white sheet they look whitish. Give each one the
 * average colour of the solid garment pixels next to it instead.
 * The invisible pixels just outside the outline get that colour too: WebP stores colour at half
 * resolution, so edge pixels borrow from their see-through neighbours, and if those still held
 * the old white background a thin white line would come back. Changes `rgba` in place.
 */
export function defringe(rgba: Uint8ClampedArray, width: number, height: number) {
  const R = 4;
  const solid = (i: number) => rgba[i * 4 + 3] >= 230;
  const out = rgba.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = rgba[i * 4 + 3];
      if (a >= 250) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (!solid(j)) continue;
          r += rgba[j * 4];
          g += rgba[j * 4 + 1];
          b += rgba[j * 4 + 2];
          count++;
        }
      }
      if (count > 0) {
        out[i * 4] = r / count;
        out[i * 4 + 1] = g / count;
        out[i * 4 + 2] = b / count;
      }
    }
  }
  rgba.set(out);
}

/**
 * Colour unmixing along the outline: each outline pixel is compared with the background just
 * outside it and the garment just inside it, and its transparency is set to how much of it is
 * really garment. A pale rim (the photo's soft transition into a white background) becomes
 * see-through, while real garment edges stay solid. Lowers alpha in `mask` in place, never raises it.
 */
export function unmixEdges(mask: Uint8ClampedArray, photo: Uint8ClampedArray, width: number, height: number, radius = 5) {
  const n = width * height;
  const a = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) a[i] = mask[i * 4 + 3];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (a[i] <= 8) continue;
      // Quick skip for the inside of the garment: solid here and `radius` away in all four
      // directions means this pixel isn't on the outline (most pixels, so this keeps it fast).
      if (
        a[i] >= 250 &&
        x >= radius && x < width - radius && y >= radius && y < height - radius &&
        a[i - radius] > 8 && a[i + radius] > 8 && a[i - radius * width] > 8 && a[i + radius * width] > 8
      )
        continue;
      let fr = 0, fg = 0, fb = 0, fn = 0; // garment colour nearby (solid pixels)
      let br = 0, bg = 0, bb = 0, bn = 0; // background colour nearby (cut-away pixels)
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          const o = j * 4;
          if (a[j] <= 8) {
            br += photo[o];
            bg += photo[o + 1];
            bb += photo[o + 2];
            bn++;
          } else if (a[j] >= 230) {
            fr += photo[o];
            fg += photo[o + 1];
            fb += photo[o + 2];
            fn++;
          }
        }
      }
      if (bn === 0 || fn === 0) continue; // not on the outline
      const dR = fr / fn - br / bn;
      const dG = fg / fn - bg / bn;
      const dB = fb / fn - bb / bn;
      const dd = dR * dR + dG * dG + dB * dB;
      if (dd < 30 * 30) continue; // garment and background too alike to tell apart: leave it
      const o = i * 4;
      const t = ((photo[o] - br / bn) * dR + (photo[o + 1] - bg / bn) * dG + (photo[o + 2] - bb / bn) * dB) / dd;
      // t ≈ 0: looks like background → clear; t ≈ 1: looks like garment → keep. Ramp in between.
      const keep = Math.min(1, Math.max(0, (t - 0.15) / 0.6));
      mask[o + 3] = Math.min(a[i], Math.round(keep * 255));
    }
  }
}
