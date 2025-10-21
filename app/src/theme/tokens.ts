import tokensJson from "@design/tokens.vnext.json";

type StringRecord = Record<string, string>;
type NumberRecord = Record<string, number>;

type FlattenOptions = {
  filter: "string" | "number";
};

const flatten = (obj: Record<string, unknown>, prefix: string[] = [], options: FlattenOptions): Record<string, string | number> => {
  const entries: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(entries, flatten(value as Record<string, unknown>, path, options));
    } else if (options.filter === "string" && typeof value === "string") {
      entries[path.join(".")] = value;
    } else if (options.filter === "number" && typeof value === "number") {
      entries[path.join(".")] = value;
    }
  }
  return entries;
};

export const tokens = tokensJson;

export type Tokens = typeof tokens;
export type ColorTokens = Tokens["color"];
export type SurfaceTokens = Tokens["color"]["surface"];
export type TextTokens = Tokens["color"]["text"];
export type AccentTokens = Tokens["color"]["accent"];
export type RadiusTokens = Tokens["radius"];
export type SpaceTokens = Tokens["space"];
export type TypographyTokens = Tokens["type"];

const flattenedColors = flatten(tokens.color, [], { filter: "string" }) as StringRecord;
const flattenedSpace = flatten(tokens.space, [], { filter: "number" }) as NumberRecord;
const flattenedRadius = flatten(tokens.radius, [], { filter: "number" }) as NumberRecord;

export type ColorTokenPath = keyof typeof flattenedColors;
export type SpaceTokenPath = keyof typeof flattenedSpace;
export type RadiusTokenPath = keyof typeof flattenedRadius;

export const theme = {
  colors: tokens.color,
  palette: flattenedColors,
  radius: tokens.radius,
  radii: flattenedRadius,
  space: tokens.space,
  spacing: flattenedSpace,
  size: tokens.size,
  elevation: tokens.elevation,
  shadow: tokens.shadow,
  opacity: tokens.opacity,
  motion: tokens.motion,
  typography: {
    fontFamily: tokens.type.fontFamily,
    scale: tokens.type.scale,
    weight: tokens.type.weight,
    lineHeight: tokens.type.lineHeight,
  },
} as const;

export type Theme = typeof theme;

export const getColor = (token: ColorTokenPath): string => theme.palette[token];
export const getSpacing = (token: SpaceTokenPath): number => theme.spacing[token];
export const getRadius = (token: RadiusTokenPath): number => theme.radii[token];
