import { createContext, PropsWithChildren, useContext } from 'react';

import { theme, Theme } from './tokens';

const ThemeContext = createContext<Theme>(theme);

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
