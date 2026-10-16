export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(random, min, max) {
  if (max < min) [min, max] = [max, min];
  return min + Math.floor(random() * (max - min + 1));
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
