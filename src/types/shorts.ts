import z from "zod";

export enum MusicMoodEnum {
  sad = "sad",
  melancholic = "melancholic",
  happy = "happy",
  euphoric = "euphoric/high",
  excited = "excited",
  chill = "chill",
  uneasy = "uneasy",
  angry = "angry",
  dark = "dark",
  hopeful = "hopeful",
  contemplative = "contemplative",
  funny = "funny/quirky",
}

export enum CaptionPositionEnum {
  top = "top",
  center = "center",
  bottom = "bottom",
}

export type Scene = {
  captions: Caption[];
  video: string;
  audio: {
    url: string;
    duration: number;
  };
};

export const sceneInput = z.object({
  text: z.string().describe("Text to be spoken in the video"),
  searchTerms: z
    .array(z.string())
    .describe(
      "Search term for video, 1 word, and at least 2-3 search terms should be provided for each scene. Make sure to match the overall context with the word - regardless what the video search result would be.",
    ),
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  af_heart = "af_heart",
  af_alloy = "af_alloy",
  af_aoede = "af_aoede",
  af_bella = "af_bella",
  af_jessica = "af_jessica",
  af_kore = "af_kore",
  af_nicole = "af_nicole",
  af_nova = "af_nova",
  af_river = "af_river",
  af_sarah = "af_sarah",
  af_sky = "af_sky",
  am_adam = "am_adam",
  am_echo = "am_echo",
  am_eric = "am_eric",
  am_fenrir = "am_fenrir",
  am_liam = "am_liam",
  am_michael = "am_michael",
  am_onyx = "am_onyx",
  am_puck = "am_puck",
  am_santa = "am_santa",
  bf_emma = "bf_emma",
  bf_isabella = "bf_isabella",
  bm_george = "bm_george",
  bm_lewis = "bm_lewis",
  bf_alice = "bf_alice",
  bf_lily = "bf_lily",
  bm_daniel = "bm_daniel",
  bm_fable = "bm_fable",
}

export enum OrientationEnum {
  landscape = "landscape",
  portrait = "portrait",
}

export enum MusicVolumeEnum {
  muted = "muted",
  low = "low",
  medium = "medium",
  high = "high",
}

export enum TransitionEnum {
  none = "none",
  fade = "fade",
  slide = "slide",
}

export enum CaptionAnimationEnum {
  none = "none",
  slideUp = "slideUp",
  fadeIn = "fadeIn",
  scale = "scale",
}

export const renderConfig = z.object({
  paddingBack: z
    .number()
    .optional()
    .describe(
      "For how long the video should be playing after the speech is done, in milliseconds. 1500 is a good value.",
    ),
  music: z
    .nativeEnum(MusicMoodEnum)
    .optional()
    .describe("Music tag to be used to find the right music for the video"),
  captionPosition: z
    .nativeEnum(CaptionPositionEnum)
    .optional()
    .describe("Position of the caption in the video"),
  captionBackgroundColor: z
    .string()
    .optional()
    .describe(
      "Background color of the caption, a valid css color, default is blue",
    ),
  voice: z.string().optional().describe(
    "Voice to be used for the speech"
  ),
  orientation: z
    .nativeEnum(OrientationEnum)
    .optional()
    .describe("Orientation of the video, default is portrait"),
  musicVolume: z
    .nativeEnum(MusicVolumeEnum)
    .optional()
    .describe("Volume of the music, default is high"),
  videoSource: z.enum(["pexels", "plex", "venice-ai"]).optional().describe("The source for the video clips"),
  plexMovieId: z.string().optional().describe("The ID of the Plex movie to use if the source is 'plex'"),
  veniceVideoModel: z.string().optional().describe("The Venice AI model to use for video generation (e.g., mochi-1-text-to-video, wan-2.5-preview-image-to-video)"),
  ttsSpeed: z.number().min(0.25).max(4.0).optional().describe("TTS speed multiplier (0.25-4.0), default is 1.0"),
  transition: z.nativeEnum(TransitionEnum).optional().describe("Transition effect between scenes"),
  transitionDuration: z.number().optional().describe("Duration of transitions in milliseconds, default is 500"),
  captionAnimation: z.nativeEnum(CaptionAnimationEnum).optional().describe("Animation effect for captions"),
  captionFontSize: z.string().optional().describe("Font size for captions (CSS value), default is 6em for portrait, 8em for landscape"),
  captionFontFamily: z.string().optional().describe("Font family for captions, default is Barlow Condensed"),
  kenBurnsEffect: z.boolean().optional().describe("Enable Ken Burns (zoom/pan) effect on videos"),
});
export type RenderConfig = z.infer<typeof renderConfig>;

export type Voices = `${VoiceEnum}`;

export type Video = {
  id: string;
  url: string;
  width: number;
  height: number;
};
export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionLine = {
  texts: Caption[];
};
export type CaptionPage = {
  startMs: number;
  endMs: number;
  lines: CaptionLine[];
};

export const createShortInput = z.object({
  scenes: z.array(sceneInput).describe("Each scene to be created"),
  config: renderConfig.describe("Configuration for rendering the video"),
});
export type CreateShortInput = z.infer<typeof createShortInput>;

export type VideoStatus = "processing" | "ready" | "failed";

export type Music = {
  file: string;
  start: number;
  end: number;
  mood: string;
};
export type MusicForVideo = Music & {
  url: string;
};

export type MusicTag = `${MusicMoodEnum}`;

export type kokoroModelPrecision = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type whisperModels =
  | "tiny"
  | "tiny.en"
  | "base"
  | "base.en"
  | "small"
  | "small.en"
  | "medium"
  | "medium.en"
  | "large-v1"
  | "large-v2"
  | "large-v3"
  | "large-v3-turbo";
