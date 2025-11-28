import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sl from './locales/sl.json';
import de from './locales/de.json';
import it from './locales/it.json';

const resources = {
  en: { translation: en },
  sl: { translation: sl },
  de: { translation: de },
  it: { translation: it },
};

// Get language from sessionStorage or default to 'en'
const storedLanguage = sessionStorage.getItem('userLanguage') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: storedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
