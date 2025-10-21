import { IntakeAnswers } from "@/state/intakeState";

export const estimateT = (answers: IntakeAnswers): number => {
  const baseline = 550;
  const modifiers = Object.values(answers).reduce<number>((sum, value) => {
    if (typeof value === "number") {
      return sum + value * 0.5;
    }
    return sum;
  }, 0);

  return Math.round(baseline + Math.min(30, modifiers));
};
