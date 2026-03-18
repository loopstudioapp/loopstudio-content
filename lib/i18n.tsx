"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "en" | "vi";

const translations = {
  // Profile picker
  "whoWorking": { en: "Who's working today?", vi: "Ai l\u00e0m vi\u1ec7c h\u00f4m nay?" },
  "enterPin": { en: "Enter 4-digit PIN", vi: "Nh\u1eadp m\u00e3 PIN 4 s\u1ed1" },
  "wrongPin": { en: "Wrong PIN", vi: "Sai m\u00e3 PIN" },
  "back": { en: "Back", vi: "Quay l\u1ea1i" },
  "loading": { en: "Loading...", vi: "\u0110ang t\u1ea3i..." },

  // Dashboard
  "hey": { en: "Hey,", vi: "Xin ch\u00e0o," },
  "accounts": { en: "accounts", vi: "t\u00e0i kho\u1ea3n" },
  "logout": { en: "Logout", vi: "\u0110\u0103ng xu\u1ea5t" },
  "tutorial": { en: "Tutorial", vi: "H\u01b0\u1edbng d\u1eabn" },
  "noAccounts": { en: "No accounts assigned yet. Ask your admin to set up your accounts.", vi: "Ch\u01b0a c\u00f3 t\u00e0i kho\u1ea3n n\u00e0o. H\u00e3y nh\u1edd admin thi\u1ebft l\u1eadp t\u00e0i kho\u1ea3n cho b\u1ea1n." },
  "noMetrics": { en: "No metrics yet", vi: "Ch\u01b0a c\u00f3 s\u1ed1 li\u1ec7u" },
  "followers": { en: "Followers", vi: "Ng\u01b0\u1eddi theo d\u00f5i" },
  "following": { en: "Following", vi: "\u0110ang theo d\u00f5i" },
  "likes": { en: "Likes", vi: "L\u01b0\u1ee3t th\u00edch" },
  "posts": { en: "Posts", vi: "B\u00e0i \u0111\u0103ng" },
  "angle": { en: "Angle", vi: "N\u1ed9i dung" },

  // Account detail
  "device": { en: "Device", vi: "Thi\u1ebft b\u1ecb" },
  "email": { en: "Email", vi: "Email" },
  "loginMethod": { en: "Login Method", vi: "Ph\u01b0\u01a1ng th\u1ee9c \u0111\u0103ng nh\u1eadp" },
  "app": { en: "App", vi: "\u1ee8ng d\u1ee5ng" },
  "notes": { en: "Notes", vi: "Ghi ch\u00fa" },
  "promptGenerator": { en: "Prompt Generator", vi: "T\u1ea1o Prompt" },
  "openChatGPT": { en: "Open ChatGPT", vi: "M\u1edf ChatGPT" },
  "metricsHistory": { en: "Metrics History", vi: "L\u1ecbch s\u1eed s\u1ed1 li\u1ec7u" },
  "autoUpdated": { en: "Auto-updated daily at 7:00 AM VN", vi: "T\u1ef1 \u0111\u1ed9ng c\u1eadp nh\u1eadt l\u00fac 7:00 s\u00e1ng" },
  "noMetricsRecorded": { en: "No metrics recorded yet", vi: "Ch\u01b0a c\u00f3 s\u1ed1 li\u1ec7u n\u00e0o" },

  // Prompt generator
  "generateTitle": { en: "Generate Title", vi: "T\u1ea1o Ti\u00eau \u0111\u1ec1" },
  "generateDescription": { en: "Generate Description", vi: "T\u1ea1o M\u00f4 t\u1ea3" },
  "generateBasePrompt": { en: "Generate Base Prompt", vi: "T\u1ea1o Prompt G\u1ed1c" },
  "generateTransformPrompt": { en: "Generate Transform Prompt", vi: "T\u1ea1o Prompt Bi\u1ebfn \u0111\u1ed5i" },
  "generateRemodelPrompt": { en: "Generate Remodel Prompt", vi: "T\u1ea1o Prompt C\u1ea3i t\u1ea1o" },
  "copyToClipboard": { en: "Copy to Clipboard", vi: "Sao ch\u00e9p" },
  "copied": { en: "Copied!", vi: "\u0110\u00e3 sao ch\u00e9p!" },
  "titleOverlay": { en: "Title (text overlay on slide 1)", vi: "Ti\u00eau \u0111\u1ec1 (ch\u1eef tr\u00ean slide 1)" },
  "descriptionCaption": { en: "Description (caption)", vi: "M\u00f4 t\u1ea3 (caption)" },
  "basePromptA1": { en: "Base Prompt \u2014 Awkward Empty Space", vi: "Prompt G\u1ed1c \u2014 Kh\u00f4ng gian tr\u1ed1ng" },
  "transformPrompt": { en: "Transform Prompt", vi: "Prompt Bi\u1ebfn \u0111\u1ed5i" },
  "basePromptA2": { en: "Base Prompt \u2014 Outdated Room", vi: "Prompt G\u1ed1c \u2014 Ph\u00f2ng c\u0169" },
  "remodelPrompt": { en: "Remodel Prompt", vi: "Prompt C\u1ea3i t\u1ea1o" },
  "comingSoon": { en: "Prompt generator for Angle {angle} coming soon.", vi: "T\u1ea1o prompt cho G\u00f3c {angle} s\u1eafp ra m\u1eaft." },

  // Tutorial
  "tutorialTitle": { en: "How to Post Content", vi: "C\u00e1ch \u0111\u0103ng n\u1ed9i dung" },
  "tutorialClose": { en: "Got it!", vi: "\u0110\u00e3 hi\u1ec3u!" },
  "step1": { en: "Generate prompt (title, description, base & transform)", vi: "T\u1ea1o prompt (ti\u00eau \u0111\u1ec1, m\u00f4 t\u1ea3, g\u1ed1c & bi\u1ebfn \u0111\u1ed5i)" },
  "step2": { en: "Generate base pic with ChatGPT", vi: "T\u1ea1o \u1ea3nh g\u1ed1c b\u1eb1ng ChatGPT" },
  "step3": { en: "Generate transform pics with base pic + prompt in ChatGPT", vi: "T\u1ea1o \u1ea3nh bi\u1ebfn \u0111\u1ed5i b\u1eb1ng \u1ea3nh g\u1ed1c + prompt trong ChatGPT" },
  "step4": { en: "Paste all 6 images to Telegram (compressed)", vi: "D\u00e1n 6 \u1ea3nh v\u00e0o Telegram (n\u00e9n)" },
  "step5": { en: "Paste title and caption to Telegram", vi: "D\u00e1n ti\u00eau \u0111\u1ec1 v\u00e0 caption v\u00e0o Telegram" },
  "step6": { en: "Download on phone", vi: "T\u1ea3i v\u1ec1 \u0111i\u1ec7n tho\u1ea1i" },
  "step7": { en: "Add text and music, post on TikTok (turn on auto download)", vi: "Th\u00eam ch\u1eef v\u00e0 nh\u1ea1c, \u0111\u0103ng l\u00ean TikTok (b\u1eadt t\u1ef1 \u0111\u1ed9ng t\u1ea3i)" },
  "step8": { en: "Post on Lemon8 using previously edited pics via TikTok auto download", vi: "\u0110\u0103ng l\u00ean Lemon8 b\u1eb1ng \u1ea3nh \u0111\u00e3 ch\u1ec9nh t\u1eeb TikTok auto download" },

  // Owner
  "ownerOverview": { en: "Owner Overview", vi: "T\u1ed5ng quan" },
  "accountsLink": { en: "Accounts", vi: "T\u00e0i kho\u1ea3n" },
  "home": { en: "Home", vi: "Trang ch\u1ee7" },
  "active": { en: "active", vi: "ho\u1ea1t \u0111\u1ed9ng" },
  "allEmployees": { en: "All Employees", vi: "T\u1ea5t c\u1ea3 nh\u00e2n vi\u00ean" },
  "allAngles": { en: "All Angles", vi: "T\u1ea5t c\u1ea3 n\u1ed9i dung" },
  "account": { en: "Account", vi: "T\u00e0i kho\u1ea3n" },
  "assignedTo": { en: "Assigned To", vi: "Giao cho" },
  "status": { en: "Status", vi: "Tr\u1ea1ng th\u00e1i" },
  "total": { en: "TOTAL", vi: "T\u1ed4NG" },
  "overview": { en: "Overview", vi: "T\u1ed5ng quan" },
  "tikTokLikes": { en: "TikTok Likes", vi: "TikTok L\u01b0\u1ee3t th\u00edch" },
  "tikTokPosts": { en: "TikTok Posts", vi: "TikTok B\u00e0i \u0111\u0103ng" },
  "lemon8Likes": { en: "Lemon8 Likes", vi: "Lemon8 L\u01b0\u1ee3t th\u00edch" },
  "lemon8Posts": { en: "Lemon8 Posts", vi: "Lemon8 B\u00e0i \u0111\u0103ng" },

  // Admin - accounts page
  "manageEmployeesAccounts": { en: "Manage employees & accounts", vi: "Qu\u1ea3n l\u00fd nh\u00e2n vi\u00ean & t\u00e0i kho\u1ea3n" },
  "employees": { en: "Employees", vi: "Nh\u00e2n vi\u00ean" },
  "add": { en: "+ Add", vi: "+ Th\u00eam" },
  "newEmployee": { en: "New Employee", vi: "Nh\u00e2n vi\u00ean m\u1edbi" },
  "editEmployee": { en: "Edit Employee", vi: "S\u1eeda nh\u00e2n vi\u00ean" },
  "name": { en: "Name", vi: "T\u00ean" },
  "pin4digit": { en: "4-digit PIN", vi: "M\u00e3 PIN 4 s\u1ed1" },
  "save": { en: "Save", vi: "L\u01b0u" },
  "update": { en: "Update", vi: "C\u1eadp nh\u1eadt" },
  "cancel": { en: "Cancel", vi: "H\u1ee7y" },
  "edit": { en: "Edit", vi: "S\u1eeda" },
  "delete": { en: "Delete", vi: "X\u00f3a" },
  "newAccount": { en: "New Account", vi: "T\u00e0i kho\u1ea3n m\u1edbi" },
  "editAccount": { en: "Edit Account", vi: "S\u1eeda t\u00e0i kho\u1ea3n" },
  "employee": { en: "Employee", vi: "Nh\u00e2n vi\u00ean" },
  "select": { en: "Select...", vi: "Ch\u1ecdn..." },
  "username": { en: "Username", vi: "T\u00ean ng\u01b0\u1eddi d\u00f9ng" },
  "loginEmail": { en: "Login Email", vi: "Email \u0111\u0103ng nh\u1eadp" },
  "unassigned": { en: "Unassigned", vi: "Ch\u01b0a giao" },
  "noDevice": { en: "No device", vi: "Ch\u01b0a c\u00f3 thi\u1ebft b\u1ecb" },
  "deleteEmployeeConfirm": { en: "Delete this employee and all their accounts?", vi: "X\u00f3a nh\u00e2n vi\u00ean v\u00e0 t\u1ea5t c\u1ea3 t\u00e0i kho\u1ea3n?" },
  "deleteAccountConfirm": { en: "Delete this account and all its metrics?", vi: "X\u00f3a t\u00e0i kho\u1ea3n v\u00e0 t\u1ea5t c\u1ea3 s\u1ed1 li\u1ec7u?" },

  // Content Generator
  "contentGenerator": { en: "Content Generator", vi: "T\u1ea1o N\u1ed9i Dung" },
  "generateContent": { en: "Generate Content & Send to Telegram", vi: "T\u1ea1o N\u1ed9i Dung & G\u1eedi Telegram" },
  "generating": { en: "Generating...", vi: "\u0110ang t\u1ea1o..." },
  "generatingBase": { en: "Generating base image...", vi: "\u0110ang t\u1ea1o \u1ea3nh g\u1ed1c..." },
  "generatingTransforms": { en: "Generating transform images...", vi: "\u0110ang t\u1ea1o \u1ea3nh bi\u1ebfn \u0111\u1ed5i..." },
  "sendingToTelegram": { en: "Sending to Telegram...", vi: "\u0110ang g\u1eedi Telegram..." },
  "generationsToday": { en: "Generations today", vi: "S\u1ed1 l\u1ea7n t\u1ea1o h\u00f4m nay" },
  "remaining": { en: "remaining", vi: "c\u00f2n l\u1ea1i" },
  "dailyLimitReached": { en: "Daily limit reached (3/3)", vi: "\u0110\u00e3 \u0111\u1ea1t gi\u1edbi h\u1ea1n h\u00f4m nay (3/3)" },
  "contentSent": { en: "Content sent to Telegram!", vi: "\u0110\u00e3 g\u1eedi n\u1ed9i dung l\u00ean Telegram!" },
  "imagesSentToTelegram": { en: "images sent to Telegram", vi: "\u1ea3nh \u0111\u00e3 g\u1eedi l\u00ean Telegram" },
  "telegramChatId": { en: "Telegram Chat ID", vi: "Telegram Chat ID" },
  "optionalAutoCreated": { en: "Optional \u2014 auto-assigned if empty", vi: "T\u00f9y ch\u1ecdn \u2014 t\u1ef1 g\u00e1n n\u1ebfu tr\u1ed1ng" },
} as const;

type Key = keyof typeof translations;

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (key: Key, vars?: Record<string, string>) => string }>({
  lang: "en",
  setLang: () => {},
  t: (key) => translations[key]?.en || key,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang;
    if (saved === "en" || saved === "vi") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };

  const t = (key: Key, vars?: Record<string, string>): string => {
    let text: string = translations[key]?.[lang] || translations[key]?.en || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  };

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
