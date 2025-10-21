import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = process.env.FIGMA_FILE_KEY || "J8m24sdi2SZokqfOPP4cOT";

if (!FIGMA_TOKEN) {
  console.error("FIGMA_TOKEN environment variable is required.");
  process.exit(1);
}

const API_BASE = "https://api.figma.com/v1";

const headers = {
  "X-Figma-Token": FIGMA_TOKEN,
  Accept: "application/json",
};

async function figmaGet(endpoint, params) {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(","));
      } else if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma request failed ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const tokensPath = path.join(rootDir, "design", "tokens.vnext.json");
const tokens = JSON.parse(await fs.readFile(tokensPath, "utf8"));

function flattenTokens(obj, prefix = []) {
  const map = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = [...prefix, key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [childPath, childValue] of flattenTokens(value, nextPath)) {
        map.set(childPath, childValue);
      }
    } else {
      map.set(nextPath.join("."), value);
    }
  }
  return map;
}

function toHex(paint) {
  if (!paint || paint.type !== "SOLID" || !paint.color) return null;
  const { r, g, b } = paint.color;
  const alpha = paint.opacity ?? paint.color?.a ?? 1;
  const base = `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255)
    .toString(16)
    .padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`.toUpperCase();
  if (alpha < 1) {
    return `${base}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase()}`;
  }
  return base;
}

const colorTokenMap = new Map();
for (const [tokenPath, value] of flattenTokens(tokens.color).entries()) {
  if (typeof value === "string" && value.startsWith("#")) {
    colorTokenMap.set(value.toUpperCase(), `color.${tokenPath}`);
  }
}

const typeScaleMap = new Map();
for (const [name, value] of Object.entries(tokens.type?.scale ?? {})) {
  typeScaleMap.set(Number(value), `type.scale.${name}`);
}
const typeWeightMap = new Map();
for (const [name, value] of Object.entries(tokens.type?.weight ?? {})) {
  typeWeightMap.set(Number(value), `type.weight.${name}`);
}

const fileData = await figmaGet(`/files/${FILE_KEY}`);
const stylesObj = fileData.styles ?? {};
const styleEntries = Object.entries(stylesObj).map(([id, meta]) => ({ id, ...meta }));

const document = fileData.document;
const styleNodesById = new Map();
const targetFrames = new Map();

const frameMatchers = [
  { label: "Paywall", test: (name) => /paywall/i.test(name) },
  { label: "Weekly Check-in", test: (name) => /weekly\s*check/i.test(name) },
  { label: "Log Modal", test: (name) => /log\s*(modal|sleep|erection|water|daily)/i.test(name) },
  { label: "Home", test: (name) => /home/i.test(name) },
];

function traverse(node, pageName = null) {
  const currentPage = node.type === "PAGE" ? node.name : pageName;

  if (node.styles) {
    for (const id of Object.values(node.styles)) {
      if (!styleNodesById.has(id)) {
        styleNodesById.set(id, node);
      }
    }
  }

  if (["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION"].includes(node.type)) {
    for (const matcher of frameMatchers) {
      if (!targetFrames.has(matcher.label) && matcher.test(node.name ?? "")) {
        targetFrames.set(matcher.label, {
          id: node.id,
          name: node.name,
          type: node.type,
          page: currentPage,
        });
        break;
      }
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => traverse(child, currentPage));
  }
}

traverse(document);

function findNodeById(node, targetId) {
  if (node.id === targetId) return node;
  if (!Array.isArray(node.children)) return null;
  for (const child of node.children) {
    const match = findNodeById(child, targetId);
    if (match) return match;
  }
  return null;
}

const colorStyles = styleEntries.filter((style) => style.styleType === "FILL");
const textStyles = styleEntries.filter((style) => style.styleType === "TEXT");

const colorDetails = [];
const colorMismatches = [];

for (const style of colorStyles) {
  const node = styleNodesById.get(style.id);
  const fill = node?.fills?.find?.((paint) => paint.type === "SOLID");
  const hex = toHex(fill);
  if (!hex) {
    colorMismatches.push({ name: style.name, reason: "No solid fill found" });
    continue;
  }
  colorDetails.push({ name: style.name, hex });
}

const textDetails = [];
const textMismatches = [];

for (const style of textStyles) {
  const node = styleNodesById.get(style.id);
  const info = node?.style;
  if (!info) {
    textMismatches.push({ name: style.name, reason: "No node uses this text style" });
    continue;
  }
  textDetails.push({
    name: style.name,
    typography: {
      fontFamily: info.fontFamily,
      fontSize: Number(info.fontSize),
      fontWeight: Number(info.fontWeight ?? info.fontPostScriptName?.match(/\d+/)?.[0] ?? 0),
      lineHeightPercent: Number(info.lineHeightPercentFontSize ?? 0),
      lineHeightPx: Number(info.lineHeightPx ?? 0),
    },
  });
}

const syncColors = {};
for (const detail of colorDetails) {
  const token = colorTokenMap.get(detail.hex.toUpperCase()) ?? null;
  syncColors[detail.name] = {
    token,
    value: detail.hex,
  };
  if (!token) {
    colorMismatches.push({ name: detail.name, hex: detail.hex, reason: "No matching token" });
  }
}

const syncText = {};
for (const detail of textDetails) {
  const { typography } = detail;
  const sizeToken = typeScaleMap.get(typography.fontSize) ?? null;
  const weightToken = typeWeightMap.get(typography.fontWeight) ?? null;
  const isInter = typography.fontFamily?.toLowerCase().includes("inter");
  syncText[detail.name] = {
    tokens: {
      size: sizeToken,
      weight: weightToken,
    },
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    lineHeightPercent: typography.lineHeightPercent,
    lineHeightPx: typography.lineHeightPx,
  };
  if (!sizeToken || !weightToken || !isInter) {
    textMismatches.push({
      name: detail.name,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      sizeToken,
      weightToken,
      isInter,
    });
  }
}

const variableData = await figmaGet(`/files/${FILE_KEY}/variables/local`).catch(() => ({ variables: [], variableCollections: [] }));
const syncVariables = {};
for (const variable of variableData.variables ?? []) {
  syncVariables[variable.name] = {
    id: variable.id,
    resolvedType: variable.resolvedType,
    values: variable.valuesByMode,
  };
}

const unknownHexes = [];
function collectUnknownPaints(node, label, ancestors = []) {
  const pathParts = [...ancestors, node.name ?? node.type];
  const path = pathParts.filter(Boolean).join(" / ");

  const inspectPaints = (paints, kind) => {
    for (const paint of paints ?? []) {
      if (paint.type !== "SOLID") continue;
      const hex = toHex(paint);
      const styleRef = node.styles?.[kind];
      if (!styleRef && hex) {
        const upper = hex.toUpperCase();
        const base = upper.length === 9 ? upper.slice(0, 7) : upper;
        const isTransparent = upper.endsWith("00");
        const matchesToken = colorTokenMap.has(upper) || colorTokenMap.has(base);
        if (!isTransparent && !matchesToken) {
          unknownHexes.push({ frame: label, path, hex });
        }
      }
    }
  };

  inspectPaints(node.fills, "fill");
  inspectPaints(node.strokes, "stroke");

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectUnknownPaints(child, label, pathParts);
    }
  }
}

for (const [label, info] of targetFrames.entries()) {
  if (!info) continue;
  const node = findNodeById(document, info.id);
  if (node) {
    collectUnknownPaints(node, label, []);
  }
}

if (unknownHexes.length > 0) {
  console.log("Unknown hexes detected in target frames:");
  for (const entry of unknownHexes) {
    console.log(`- ${entry.frame}: ${entry.hex} at ${entry.path}`);
  }
  process.exit(1);
}

const syncMap = {
  colors: syncColors,
  text: syncText,
  variables: syncVariables,
};

await fs.writeFile(path.join(rootDir, "design", "figma-sync-map.json"), JSON.stringify(syncMap, null, 2));

const mismatchReport = {
  colors: colorMismatches,
  text: textMismatches,
  variables: (variableData.variables ?? []).length ? [] : [
    { name: "Variables", status: "missing", note: "Variables endpoint returned no entries." },
  ],
  frames: Array.from(targetFrames.entries()).map(([label, info]) => ({ label, ...info })),
};

await fs.writeFile(path.join(rootDir, "design", "figma-sync-report.json"), JSON.stringify(mismatchReport, null, 2));

const previewDir = path.join(rootDir, "design", "figma-previews");
await fs.mkdir(previewDir, { recursive: true });

const frameIds = Array.from(targetFrames.values())
  .filter(Boolean)
  .map((info) => info.id);

if (frameIds.length > 0) {
  const images = await figmaGet(`/images/${FILE_KEY}`, { ids: frameIds, format: "png", scale: 2 });
  for (const [nodeId, url] of Object.entries(images.images ?? {})) {
    if (!url) continue;
    const entry = Array.from(targetFrames.entries()).find(([, info]) => info.id === nodeId);
    if (!entry) continue;
    const [label] = entry;
    const fileName = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "frame"}@2x.png`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed to download preview for ${label}: ${res.status}`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(path.join(previewDir, fileName), buffer);
  }
}

console.log("Figma sync complete.");

