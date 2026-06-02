import React, { createContext, useContext, useMemo } from 'react';
import { AppLanguage } from '../types';
import { MESSAGES, MessageKey } from '../i18n/messages';

interface I18nContextValue {
  language: AppLanguage;
  locale: string;
  t: (key: MessageKey | string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const formatMessage = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(params[token] ?? ''));
};

export const I18nProvider: React.FC<{ language: AppLanguage; children: React.ReactNode }> = ({ language, children }) => {
  const value = useMemo<I18nContextValue>(() => {
    const dict = MESSAGES[language] || MESSAGES.en;
    return {
      language,
      locale: language === 'uk' ? 'uk-UA' : 'en-US',
      t: (key, params) => {
        const allCurrent = dict as Record<string, string>;
        const allEn = MESSAGES.en as Record<string, string>;
        const template = allCurrent[key] || allEn[key] || key;
        return formatMessage(template, params);
      },
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
