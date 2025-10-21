import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "tup.install_id";

const generateUuid = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.random() * 16 | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

const isUuid = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

export const getOrCreateInstallId = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isUuid(stored)) {
      return stored as string;
    }
  } catch (error) {
    console.warn("[installId] failed to read storage", error);
  }

  const installId = generateUuid();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, installId);
  } catch (error) {
    console.warn("[installId] failed to persist install_id", error);
  }

  return installId;
};
