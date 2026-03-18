import { pick, pickN } from "@/lib/utils";
import { SPACE_TYPES, HOME_STYLES as A1_HOME_STYLES, FLOORINGS, LIGHTINGS as A1_LIGHTINGS, VIBES, A1_TITLES, A1_CAPTIONS } from "@/lib/prompts/angle1";
import { ROOM_TYPES, ROOM_CONDITIONS, ROOM_DETAILS, REMODEL_STYLES, A2_TITLES, A2_CAPTIONS, HOME_STYLES as A2_HOME_STYLES, LIGHTINGS as A2_LIGHTINGS } from "@/lib/prompts/angle2";

export interface GeneratedContent {
  title: string;
  caption: string;
  basePrompt: string;
  transformPrompts: string[];
}

export function generateAngle1Content(): GeneratedContent {
  const space = pick(SPACE_TYPES);
  const style = pick(A1_HOME_STYLES);
  const floor = pick(FLOORINGS);
  const light = pick(A1_LIGHTINGS);

  const basePrompt = `Generate a realistic iPhone-style photo of an awkward, empty, unused small space inside an American suburban home.\n\nSpace: ${space}\nHome style: ${style}\nFlooring: ${floor}\nLighting: ${light}\n\nCasual candid angle as if a homeowner is filming a TikTok. Aspect ratio 9:16, 1080x1920 pixels.`;

  const vibes = pickN(VIBES, 5);
  const transformPrompts = vibes.map((vibe) =>
    `Redesign this empty space in the photo.\n\nTurn it into ${vibe}.\n\nOnly redesign that one area, don't touch anything else in the room. Keep the dimensions and sizing of the space the same. Keep it clean.`
  );

  return {
    title: pick(A1_TITLES),
    caption: pick(A1_CAPTIONS),
    basePrompt,
    transformPrompts,
  };
}

export function generateAngle2Content(): GeneratedContent {
  const room = pick(ROOM_TYPES);
  const condition = pick(ROOM_CONDITIONS);
  const details = pick(ROOM_DETAILS);
  const style = pick(A2_HOME_STYLES);
  const light = pick(A2_LIGHTINGS);

  const basePrompt = `Generate a realistic iPhone-style photo of a ${condition} ${room} in an American suburban home.\n\nHome style: ${style}\nDetails: ${details}\nLighting: ${light}\n\nThe room is tidy but outdated — no trash, no clutter, no mess. Casual candid angle as if a homeowner is filming a TikTok. Aspect ratio 9:16, 1080x1920 pixels.`;

  const styles = pickN(REMODEL_STYLES, 5);
  const transformPrompts = styles.map((s) =>
    `Completely remodel this room.\n\nMake it ${s}.\n\nKeep the same room layout and dimensions. Keep it clean.`
  );

  return {
    title: pick(A2_TITLES),
    caption: pick(A2_CAPTIONS),
    basePrompt,
    transformPrompts,
  };
}

export function generateContent(angle: number): GeneratedContent {
  if (angle === 1) return generateAngle1Content();
  if (angle === 2) return generateAngle2Content();
  throw new Error(`Unsupported angle: ${angle}`);
}
