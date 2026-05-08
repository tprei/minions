const ADJECTIVES = [
  "amber", "calm", "fern", "drift", "azure", "brisk", "cedar", "dusk",
  "echo", "flint", "gilt", "haze", "iris", "jade", "keen", "lark",
  "mist", "navy", "opal", "pine", "quay", "reed", "sage", "tide",
  "umber", "vale", "wren", "xray", "yew", "zest", "bold", "crisp",
  "deep", "earl", "frost",
];

const CITIES = [
  "seoul", "lagos", "porto", "lima", "oslo", "tunis", "accra", "baku",
  "doha", "hanoi", "riga", "sofia", "tirana", "minsk", "niamey",
  "nassau", "apia", "suva", "honiara", "nuku", "funafuti", "tarawa",
  "majuro", "palikir", "yaren", "maloelap", "pohnpei", "dili", "sanaa",
  "muscat", "maseru", "mbabane", "gaborone", "moroni", "banjul",
];

function fnv1a32(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function fnv1a32ForTest(str) {
  return fnv1a32(str);
}

export function cityAlias(workflowId) {
  const hash = fnv1a32(workflowId);
  const adjIdx = hash % ADJECTIVES.length;
  const cityIdx = Math.floor(hash / ADJECTIVES.length) % CITIES.length;
  const num = hash % 1000;
  const numStr = String(num).padStart(3, "0");
  return `${ADJECTIVES[adjIdx]}-${CITIES[cityIdx]}-${numStr}`;
}
