/**
 * Custom background subtraction for clothing photos taken on a fairly plain background
 * (bed, floor, wall, table). Pure TypeScript, no DOM, so it can be tested anywhere.
 *
 * How it works:
 *  1. Convert every pixel to CIE Lab, a color space where distance ≈ how different
 *     two colors look to a person.
 *  2. Learn the background colors from a thin band around the photo's edges, grouping
 *     them into up to 3 clusters with k-means (e.g. bedsheet + its shadow + a floor strip).
 *     A color only counts as background if it shows up on at least 3 of the 4 sides,
 *     so a dress that runs off the bottom of the photo is not mistaken for background.
 *  3. Score each pixel by how close it is to the nearest background cluster. Brightness
 *     counts for less than hue, so soft shadows still read as background.
 *  4. Flood-fill from the edges through background-like pixels. Pixels that only *roughly*
 *     match the background can't be crossed where there is a visible edge, so the fill
 *     stops at the garment's outline even when the garment is a similar color.
 *  5. Find the OUTLINE, then keep everything inside it: every area the item fully encloses is
 *     filled (prints, logos), and small gaps in the outline are closed (white stripes that run
 *     to the shirt's edge). A big gap that closing would seal off (the wall between a hanging
 *     sleeve and the body) stays background. (The inside of a bag strap is kept: erase it.)
 *  Before all that, colours are lightly blurred so textured backgrounds like carpet look even.
 *  6. Clean up: keep the main garment(s), drop specks, feather the edge.
 */

export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray };

export type SubtractOptions = {
  /** 0.5 = remove less (keeps more of the photo), 2 = remove more. Default 1. */
  tolerance?: number;
};

const BRIGHTNESS_WEIGHT = 0.5; // shadows change brightness much more than hue
const MAX_CLUSTERS = 3;
const MIN_SIDE_SHARE = 0.1; // a cluster "is on" a side if it covers ≥10% of that side
const MIN_SIDES = 3;
const MIN_SCALE = 7; // ΔE below which two colors always count as the same background
const CLEAR_BACKGROUND = 0.5; // score below this: background, whatever the edges say
const EDGE_STRENGTH = 4; // brightness change (L units per pixel) that the fill won't cross
const GAP_CLOSE = 0.03; // close outline gaps up to ~6% of the photo's size (e.g. stripes reaching the edge)
const SMOOTH = 1 / 200; // blur radius as a fraction of the photo's size: evens out carpet / fabric texture
const OPEN_GAP = 0.02; // a sealed-off gap reaching this far (2% of size) from the item is real background

/** Returns an alpha mask (0 = background, 255 = keep), one byte per pixel. */
export function subtractBackground(image: RGBAImage, options: SubtractOptions = {}): Uint8ClampedArray {
  const { width, height, data } = image;
  const n = width * height;
  const tolerance = options.tolerance ?? 1;

  // 1. Lab
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [l, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    L[i] = l;
    A[i] = a;
    B[i] = b;
  }

  // Judge each pixel by the average colour of its small neighbourhood, so textured
  // backgrounds (speckled carpet, wood grain) read as one even colour.
  const smoothR = Math.max(1, Math.round(Math.max(width, height) * SMOOTH));
  const sharpL = L.slice(); // edges are found on the unblurred photo
  const sharpA = A.slice();
  const sharpB = B.slice();
  for (const ch of [L, A, B]) {
    ch.set(boxBlurN(boxBlurN(ch, width, height, smoothR), width, height, smoothR));
  }

  // 2. Background clusters from the border band
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const borderIdx = borderIndices(width, height, band, 4000);
  const { clusters: all, assign } = kMeans(borderIdx, L, A, B, MAX_CLUSTERS);
  const sides = sideCoverage(borderIdx, assign, all.length, width, height, band);
  let clusters = all.filter((_, ci) => sides[ci] >= MIN_SIDES);
  if (clusters.length === 0) {
    // Nothing surrounds the item on 3 sides: fall back to the most common edge color.
    clusters = [all.reduce((a, b) => (b.count > a.count ? b : a))];
  }

  // 3. Background score: < 1 means "looks like background"
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (const c of clusters) {
      const d =
        Math.hypot((L[i] - c.l) / c.scaleL, (A[i] - c.a) / c.scaleA, (B[i] - c.b) / c.scaleB) / tolerance;
      if (d < best) best = d;
    }
    score[i] = best;
  }

  // 4. Flood fill from the edges, stopping at visible edges for "roughly background" pixels
  const edge = edgeStrength(sharpL, width, height);
  const bg = new Uint8Array(n); // 1 = background
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (bg[i] || score[i] >= 1) return;
    if (score[i] >= CLEAR_BACKGROUND && edge[i] > EDGE_STRENGTH) return;
    bg[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < n - width) push(i + width);
  }

  // The edge rule can leave a thin rim of background-coloured pixels hugging the outline;
  // peel it off (only pixels that look like background, at most a few pixels deep).
  trimRim(bg, score, width, height, 3);

  // 5. Outline → solid shape.
  let fg: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = bg[i] ? 0 : 1;
  fg = dilate(erode(fg, width, height, 1), width, height, 1); // drop specks first
  keepMainComponents(fg, width, height);
  // a) Anything fully enclosed by the item is part of it (prints, logos, a bag strap's inside).
  fillHoles(fg, width, height);
  // b) Close small gaps in the outline (e.g. white stripes running to the shirt's edge)…
  const r = Math.max(2, Math.round(Math.max(width, height) * GAP_CLOSE));
  const closed = erode(dilate(fg, width, height, r), width, height, r);
  fillHoles(closed, width, height);
  // …but only keep the thin bits that closing added. An added area that reaches far from the
  // item (the wall between a sleeve and the body) is a real gap, so it stays background.
  const near = dilate(fg, width, height, Math.max(2, Math.round(Math.max(width, height) * OPEN_GAP)));
  const [labels, sizes] = label(width, height, (i) => closed[i] === 1 && fg[i] === 0);
  const isOpenGap = new Uint8Array(sizes.length);
  for (let i = 0; i < n; i++) if (labels[i] >= 0 && !near[i]) isOpenGap[labels[i]] = 1;
  for (let i = 0; i < n; i++) if (labels[i] >= 0 && !isOpenGap[labels[i]]) fg[i] = 1;

  // 6. Sharpen the outline: the blur in step 1 softened it by a few pixels, so pixels near the
  //    edge are decided again from the unblurred photo, but only when they clearly look like
  //    background (or clearly don't); unclear ones keep the smooth answer.
  const nearEdge = dilate(fg, width, height, smoothR + 1);
  const insideCore = erode(fg, width, height, smoothR + 1);
  for (let i = 0; i < n; i++) {
    if (!nearEdge[i] || insideCore[i]) continue;
    let best = Infinity;
    for (const c of clusters) {
      const d = Math.hypot((sharpL[i] - c.l) / c.scaleL, (sharpA[i] - c.a) / c.scaleA, (sharpB[i] - c.b) / c.scaleB) / tolerance;
      if (d < best) best = d;
    }
    if (best < 0.6) fg[i] = 0;
    else if (best > 1.6) fg[i] = 1;
  }
  fg = dilate(erode(fg, width, height, 1), width, height, 1); // smooth away single-pixel noise

  // 7. Clean up
  keepMainComponents(fg, width, height);
  return feather(fg, width, height);
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // sRGB → XYZ (D65), normalised by the white point
  const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047;
  const y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(l1: number, a1: number, b1: number, l2: number, a2: number, b2: number) {
  const dl = (l1 - l2) * BRIGHTNESS_WEIGHT;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ---------------------------------------------------------------------------
// Border sampling + k-means
// ---------------------------------------------------------------------------

function borderIndices(width: number, height: number, band: number, maxSamples: number): number[] {
  const all: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < band || y < band || x >= width - band || y >= height - band) all.push(y * width + x);
    }
  }
  const step = Math.max(1, Math.floor(all.length / maxSamples));
  return step === 1 ? all : all.filter((_, k) => k % step === 0);
}

/**
 * A background colour and how much it varies, per channel: carpet varies a lot in brightness
 * (light and dark flecks) but little in hue, so a slightly greener shirt still stands out.
 */
type Cluster = { l: number; a: number; b: number; count: number; scaleL: number; scaleA: number; scaleB: number };

// Smallest tolerances (Lab units). Brightness gets more room so soft shadows count as background.
const FLOOR_L = 14;
const FLOOR_AB = 5;
const SPREAD_K = 3; // how many "typical deviations" from the background colour still count

/** Groups the samples into ≤k colors. `assign[s]` is the cluster of sample `idx[s]`. */
function kMeans(
  idx: number[],
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  k: number,
): { clusters: Cluster[]; assign: Int32Array } {
  // Farthest-point initialisation: start at the first sample, then repeatedly add the
  // sample farthest from every existing center.
  const centers: [number, number, number][] = [[L[idx[0]], A[idx[0]], B[idx[0]]]];
  while (centers.length < k) {
    let far = idx[0];
    let farDist = -1;
    for (const i of idx) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, labDistance(L[i], A[i], B[i], c[0], c[1], c[2]));
      if (d > farDist) {
        farDist = d;
        far = i;
      }
    }
    if (farDist < MIN_SCALE) break; // border is basically one color
    centers.push([L[far], A[far], B[far]]);
  }

  const assign = new Int32Array(idx.length);
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    idx.forEach((i, s) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, ci) => {
        const d = labDistance(L[i], A[i], B[i], c[0], c[1], c[2]);
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      assign[s] = best;
      const sum = sums[best];
      sum[0] += L[i];
      sum[1] += A[i];
      sum[2] += B[i];
      sum[3]++;
    });
    sums.forEach((sum, ci) => {
      if (sum[3] > 0) centers[ci] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }

  // How spread out each cluster is decides how far from its center still counts as background.
  // Merge clusters that are really one textured surface (e.g. wood grain split in two).
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const [ci, cj] = [centers[i], centers[j]];
      if (labDistance(ci[0], ci[1], ci[2], cj[0], cj[1], cj[2]) < MIN_SCALE * 2) {
        for (let s = 0; s < assign.length; s++) {
          if (assign[s] === j) assign[s] = i;
          else if (assign[s] > j) assign[s]--;
        }
        centers.splice(j, 1);
        j = i; // re-check i against the remaining clusters
      }
    }
  }
  // Recompute each center from its (possibly merged) members.
  centers.forEach((_, ci) => {
    const sum = [0, 0, 0, 0];
    idx.forEach((i, s) => {
      if (assign[s] !== ci) return;
      sum[0] += L[i];
      sum[1] += A[i];
      sum[2] += B[i];
      sum[3]++;
    });
    if (sum[3] > 0) centers[ci] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
  });

  const clusters = centers.map((c, ci) => {
    let dl = 0;
    let da = 0;
    let db = 0;
    let count = 0;
    idx.forEach((i, s) => {
      if (assign[s] === ci) {
        dl += Math.abs(L[i] - c[0]);
        da += Math.abs(A[i] - c[1]);
        db += Math.abs(B[i] - c[2]);
        count++;
      }
    });
    const n = Math.max(1, count);
    return {
      l: c[0],
      a: c[1],
      b: c[2],
      count,
      scaleL: Math.max(FLOOR_L, (SPREAD_K * dl) / n),
      scaleA: Math.max(FLOOR_AB, (SPREAD_K * da) / n),
      scaleB: Math.max(FLOOR_AB, (SPREAD_K * db) / n),
    };
  });
  return { clusters, assign };
}

/** For each cluster, on how many of the 4 photo edges it covers at least MIN_SIDE_SHARE. */
function sideCoverage(
  idx: number[],
  assign: Int32Array,
  clusterCount: number,
  width: number,
  height: number,
  band: number,
): number[] {
  const perSide = [0, 1, 2, 3].map(() => ({ total: 0, byCluster: new Array<number>(clusterCount).fill(0) }));
  idx.forEach((i, s) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const onSides = [x < band, x >= width - band, y < band, y >= height - band];
    onSides.forEach((on, side) => {
      if (!on) return;
      perSide[side].total++;
      perSide[side].byCluster[assign[s]]++;
    });
  });
  return Array.from({ length: clusterCount }, (_, ci) =>
    perSide.filter((side) => side.total > 0 && side.byCluster[ci] / side.total >= MIN_SIDE_SHARE).length,
  );
}

// ---------------------------------------------------------------------------
// Mask clean-up
// ---------------------------------------------------------------------------

/** Labels 4-connected regions where `inRegion(i)` is true. Returns [labels, sizes]. */
function label(width: number, height: number, inRegion: (i: number) => boolean): [Int32Array, number[]] {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1 || !inRegion(start)) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % width;
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of neighbors) {
        if (j >= 0 && j < n && labels[j] === -1 && inRegion(j)) {
          labels[j] = id;
          stack[top++] = j;
        }
      }
    }
    sizes.push(size);
  }
  return [labels, sizes];
}

/** Turns background-looking pixels that touch the background into background, `depth` times. */
function trimRim(bg: Uint8Array, score: Float32Array, width: number, height: number, depth: number) {
  const n = width * height;
  for (let pass = 0; pass < depth; pass++) {
    const peel: number[] = [];
    for (let i = 0; i < n; i++) {
      if (bg[i] || score[i] >= 1) continue;
      const x = i % width;
      if ((x > 0 && bg[i - 1]) || (x < width - 1 && bg[i + 1]) || (i >= width && bg[i - width]) || (i < n - width && bg[i + width]))
        peel.push(i);
    }
    if (peel.length === 0) return;
    for (const i of peel) bg[i] = 1;
  }
}

/** Marks every non-shape area that can't be reached from the photo's border as shape. */
function fillHoles(fg: Uint8Array, width: number, height: number) {
  const n = width * height;
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (!fg[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < n - width) push(i + width);
  }
  for (let i = 0; i < n; i++) if (!outside[i]) fg[i] = 1;
}

/** How sharply brightness changes at each pixel (on a lightly blurred copy, to ignore noise). */
function edgeStrength(L: Float32Array, width: number, height: number): Float32Array {
  const smooth = boxBlur(boxBlur(L, width, height), width, height);
  const out = new Float32Array(L.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] = Math.max(Math.abs(smooth[i + 1] - smooth[i - 1]), Math.abs(smooth[i + width] - smooth[i - width])) / 2;
    }
  }
  return out;
}

/** Box blur of radius r (row pass + column pass with running sums, so any r is fast). */
function boxBlurN(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const pass = (input: Float32Array, len: number, lines: number, at: (line: number, k: number) => number) => {
    const out = new Float32Array(input.length);
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      let count = 0;
      for (let k = 0; k < Math.min(r, len); k++) {
        sum += input[at(line, k)];
        count++;
      }
      for (let k = 0; k < len; k++) {
        if (k + r < len) {
          sum += input[at(line, k + r)];
          count++;
        }
        if (k - r - 1 >= 0) {
          sum -= input[at(line, k - r - 1)];
          count--;
        }
        out[at(line, k)] = sum / count;
      }
    }
    return out;
  };
  const rows = pass(src, width, height, (y, x) => y * width + x);
  return pass(rows, height, width, (x, y) => y * width + x);
}

function boxBlur(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += src[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

/** Keeps the largest foreground region plus any other region at least 15% of its size. */
function keepMainComponents(fg: Uint8Array, width: number, height: number) {
  const [labels, sizes] = label(width, height, (i) => fg[i] === 1);
  if (sizes.length === 0) return;
  const largest = Math.max(...sizes);
  const minKeep = Math.max(largest * 0.15, width * height * 0.002);
  for (let i = 0; i < fg.length; i++) {
    if (fg[i] && sizes[labels[i]] < minKeep) fg[i] = 0;
  }
}

function dilate(m: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return morph(m, width, height, r, true);
}

function erode(m: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return morph(m, width, height, r, false);
}

/**
 * Square dilation (any 1 within r → 1) or erosion (any 0 within r → 0) of a 0/1 mask.
 * Done as a row pass then a column pass with running sums, so a big r costs no more than r = 1.
 * Pixels beyond the photo count as 0, so erosion also trims the border.
 */
function morph(m: Uint8Array, width: number, height: number, r: number, isDilate: boolean): Uint8Array {
  const pass = (src: Uint8Array, len: number, lines: number, at: (line: number, k: number) => number) => {
    const out = new Uint8Array(src.length);
    for (let line = 0; line < lines; line++) {
      let ones = 0;
      for (let k = 0; k < Math.min(r, len); k++) ones += src[at(line, k)];
      for (let k = 0; k < len; k++) {
        if (k + r < len) ones += src[at(line, k + r)];
        if (k - r - 1 >= 0) ones -= src[at(line, k - r - 1)];
        const window = 2 * r + 1; // pixels outside the photo count as 0
        out[at(line, k)] = isDilate ? (ones > 0 ? 1 : 0) : ones === window ? 1 : 0;
      }
    }
    return out;
  };
  const rows = pass(m, width, height, (y, x) => y * width + x);
  return pass(rows, height, width, (x, y) => y * width + x);
}

/** Softens the hard 0/1 edge into a ~2 px alpha ramp (two 3x3 box blurs). */
function feather(fg: Uint8Array, width: number, height: number): Uint8ClampedArray {
  let a = new Float32Array(fg.length);
  for (let i = 0; i < fg.length; i++) a[i] = fg[i];
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(a.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += a[yy * width + xx];
            count++;
          }
        }
        out[y * width + x] = sum / count;
      }
    }
    a = out;
  }
  const alpha = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) alpha[i] = Math.round(a[i] * 255);
  return alpha;
}
