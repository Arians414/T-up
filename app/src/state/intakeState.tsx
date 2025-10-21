import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import part1Schema from "@schemas/qa.intake.part1.v2.json";
import part2Schema from "@schemas/qa.intake.part2.v2.json";

export type DependsOnDefinition = {
  id: string;
  equals?: unknown;
  notEquals?: unknown;
  anyOf?: unknown[];
};

type SchemaQuestion = {
  id: string;
  required?: boolean;
  dependsOn?: DependsOnDefinition;
} & Record<string, unknown>;

type SchemaDefinition = {
  questions?: SchemaQuestion[];
  sections?: Array<{ questions?: SchemaQuestion[] }>;
};

export const extractQuestions = (schema: SchemaDefinition): SchemaQuestion[] => {
  if (Array.isArray(schema.sections)) {
    return schema.sections.flatMap((section) => section.questions ?? []);
  }
  return schema.questions ?? [];
};

const STORAGE_KEY = "tup.intake.v1";

export type IntakeAnswers = Record<string, unknown>;

const defaultState = {
  part1Answers: {} as IntakeAnswers,
  part2Answers: {} as IntakeAnswers,
};

type PartKey = "part1Answers" | "part2Answers";

const part1Questions = extractQuestions(part1Schema);
const part2Questions = extractQuestions(part2Schema);

type IntakeContextValue = {
  isHydrating: boolean;
  part1Answers: IntakeAnswers;
  part2Answers: IntakeAnswers;
  setAnswer: (part: 1 | 2, id: string, value: unknown) => void;
  reset: () => void;
  part1Completed: boolean;
  part2Completed: boolean;
  getNextStepIndex: (part: 1 | 2) => number;
};

const IntakeStateContext = createContext<IntakeContextValue | undefined>(undefined);

const isAnswered = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== "";
};

export const shouldDisplayQuestion = (question: SchemaQuestion, answers: IntakeAnswers): boolean => {
  const depends = question.dependsOn;
  if (!depends) {
    return true;
  }
  const value = answers[depends.id];
  if (depends.equals !== undefined) {
    return value === depends.equals;
  }
  if (depends.notEquals !== undefined) {
    return value !== depends.notEquals;
  }
  if (Array.isArray(depends.anyOf)) {
    if (Array.isArray(value)) {
      return value.some((item) => depends.anyOf?.includes(item));
    }
    return depends.anyOf.includes(value);
  }
  return true;
};

const areQuestionsComplete = (answers: IntakeAnswers, questions: SchemaQuestion[]) => {
  const visible = questions.filter((question) => shouldDisplayQuestion(question, answers));
  return visible.every((question) => {
    if (!question.required) {
      return true;
    }
    return isAnswered(answers[question.id]);
  });
};

const nextUnansweredIndex = (answers: IntakeAnswers, questions: SchemaQuestion[]) => {
  const visible = questions.filter((question) => shouldDisplayQuestion(question, answers));
  const index = visible.findIndex((question) => question.required && !isAnswered(answers[question.id]));
  return index === -1 ? visible.length : index;
};

export const IntakeStateProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState(defaultState);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setState({
            part1Answers: parsed.part1Answers ?? {},
            part2Answers: parsed.part2Answers ?? {},
          });
        }
      } catch (error) {
        console.warn("Failed to load intake state", error);
      } finally {
        setIsHydrating(false);
      }
    };

    load();
  }, []);

  const persist = useCallback(async (updater: (prev: typeof defaultState) => typeof defaultState) => {
    setState((prev) => {
      const next = updater(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) =>
        console.warn("Failed to persist intake state", error),
      );
      return next;
    });
  }, []);

  const setAnswer = useCallback<IntakeContextValue["setAnswer"]>(
    (part, id, value) => {
      const key: PartKey = part === 1 ? "part1Answers" : "part2Answers";
      persist((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          [id]: value,
        },
      }));
    },
    [persist],
  );

  const reset = useCallback(() => {
    persist(() => defaultState);
  }, [persist]);

  const part1Completed = useMemo(() => areQuestionsComplete(state.part1Answers, part1Questions), [state.part1Answers]);
  const part2Completed = useMemo(() => areQuestionsComplete(state.part2Answers, part2Questions), [state.part2Answers]);

  const getNextStepIndex = useCallback<IntakeContextValue["getNextStepIndex"]>(
    (part) => {
      return part === 1
        ? nextUnansweredIndex(state.part1Answers, part1Questions)
        : nextUnansweredIndex(state.part2Answers, part2Questions);
    },
    [state.part1Answers, state.part2Answers],
  );

  const value = useMemo(
    () => ({
      isHydrating,
      part1Answers: state.part1Answers,
      part2Answers: state.part2Answers,
      setAnswer,
      reset,
      part1Completed,
      part2Completed,
      getNextStepIndex,
    }),
    [getNextStepIndex, isHydrating, part1Completed, part2Completed, reset, setAnswer, state.part1Answers, state.part2Answers],
  );

  return <IntakeStateContext.Provider value={value}>{children}</IntakeStateContext.Provider>;
};

export const useIntakeState = () => {
  const context = useContext(IntakeStateContext);
  if (!context) {
    throw new Error("useIntakeState must be used within IntakeStateProvider");
  }
  return context;
};

export const useIntakeQuestions = () => ({
  part1Questions,
  part2Questions,
});

export const isQuestionAnswered = (answers: IntakeAnswers, id: string) => isAnswered(answers[id]);
