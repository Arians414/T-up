import { StyleSheet, View } from "react-native";

import { getColor, getRadius, getSpacing } from "@/theme";

type ProgressProps = {
  value: number;
  height?: number;
};

const TRACK_COLOR = getColor("surface.progressRemainder");
const ACTIVE_COLOR = getColor("accent.brand");
const PROGRESS_RADIUS = getRadius("pill");
const DEFAULT_HEIGHT = getSpacing("6");

export const Progress = ({ value, height = DEFAULT_HEIGHT }: ProgressProps) => {
  const clamped = Math.min(Math.max(value, 0), 1);
  const percent = Math.round(clamped * 100);

  return (
    <View
      style={[styles.track, { height, borderRadius: PROGRESS_RADIUS, backgroundColor: TRACK_COLOR }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: ACTIVE_COLOR, borderRadius: PROGRESS_RADIUS }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
