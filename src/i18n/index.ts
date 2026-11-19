import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

// English-only UI; i18next stays as the string catalogue so copy lives in one place.
void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
