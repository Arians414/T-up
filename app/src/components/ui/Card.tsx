import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { getColor, getRadius, getSpacing } from "@/theme";

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  padding?: number;
  testID?: string;
}>;

const CARD_RADIUS = getRadius("card");
const CARD_PADDING = getSpacing("24");
const CARD_BACKGROUND = getColor("surface.card");
const CARD_BORDER = getColor("border.subtle");

export const Card = ({ children, style, padding = CARD_PADDING, testID }: CardProps) => {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          padding,
          borderRadius: CARD_RADIUS,
          backgroundColor: CARD_BACKGROUND,
          borderColor: CARD_BORDER,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
});