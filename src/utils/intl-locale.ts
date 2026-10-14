/** App/i18next locale keys are not always valid BCP 47 tags for Intl. */
export const resolveIntlLocale = (language?: string): string => {
  const tag = language?.trim().replace(/_/g, "-") || "en";
  const aliases: Record<string, string> = {
    zhcn: "zh-CN",
    zhtw: "zh-TW",
    enus: "en-US",
    ruru: "ru-RU",
    fair: "fa-IR",
  };
  try {
    return (
      Intl.getCanonicalLocales(aliases[tag.toLowerCase()] ?? tag)[0] ?? "en"
    );
  } catch {
    return "en";
  }
};
