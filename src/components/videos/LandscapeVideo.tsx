import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  interpolate,
  spring,
} from "remotion";
import type { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

import { createCaptionPages, calculateVolume } from "../utils";
import type { shortVideoSchema } from "../utils";
import { TransitionEnum, CaptionAnimationEnum } from "../../types/shorts";

const { fontFamily } = loadFont(); // "Barlow Condensed"

export const LandscapeVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
  scenes,
  music,
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const captionBackgroundColor = config.captionBackgroundColor ?? "blue";
  const transition = config.transition ?? TransitionEnum.none;
  const transitionDuration = config.transitionDuration ?? 500;
  const transitionDurationFrames = (transitionDuration / 1000) * fps;
  const captionAnimation = config.captionAnimation ?? CaptionAnimationEnum.none;
  const captionFontSize = config.captionFontSize ?? "8em";
  const captionFont = config.captionFontFamily ?? fontFamily;
  const kenBurnsEnabled = config.kenBurnsEffect ?? false;

  const activeStyle = {
    backgroundColor: captionBackgroundColor,
    padding: "10px",
    marginLeft: "-10px",
    marginRight: "-10px",
    borderRadius: "10px",
  };

  const captionPosition = config.captionPosition ?? "center";
  let captionStyle = {};
  if (captionPosition === "top") {
    captionStyle = { top: 100 };
  }
  if (captionPosition === "center") {
    captionStyle = { top: "50%", transform: "translateY(-50%)" };
  }
  if (captionPosition === "bottom") {
    captionStyle = { bottom: 100 };
  }

  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  // Ken Burns effect helper
  const getKenBurnsStyle = (sceneFrame: number, sceneDuration: number) => {
    if (!kenBurnsEnabled) return {};

    const progress = sceneFrame / sceneDuration;
    const scale = interpolate(progress, [0, 1], [1, 1.2]);
    const translateX = interpolate(progress, [0, 1], [0, -10]);
    const translateY = interpolate(progress, [0, 1], [0, -10]);

    return {
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
      transition: 'transform 0.1s linear',
    };
  };

  // Transition effect helper
  const getTransitionStyle = (sceneFrame: number, sceneDuration: number) => {
    if (transition === TransitionEnum.none) return { opacity: 1 };

    const fadeInProgress = interpolate(
      sceneFrame,
      [0, transitionDurationFrames],
      [0, 1],
      { extrapolateRight: 'clamp' }
    );

    const fadeOutProgress = interpolate(
      sceneFrame,
      [sceneDuration - transitionDurationFrames, sceneDuration],
      [1, 0],
      { extrapolateLeft: 'clamp' }
    );

    if (transition === TransitionEnum.fade) {
      return { opacity: Math.min(fadeInProgress, fadeOutProgress) };
    }

    if (transition === TransitionEnum.slide) {
      const slideIn = interpolate(
        sceneFrame,
        [0, transitionDurationFrames],
        [100, 0],
        { extrapolateRight: 'clamp' }
      );
      return {
        opacity: Math.min(fadeInProgress, fadeOutProgress),
        transform: sceneFrame < transitionDurationFrames ? `translateX(${slideIn}%)` : 'translateX(0)'
      };
    }

    return { opacity: 1 };
  };

  // Caption animation helper
  const getCaptionAnimationStyle = (pageFrame: number) => {
    if (captionAnimation === CaptionAnimationEnum.none) return {};

    const animationDuration = 15; // frames

    if (captionAnimation === CaptionAnimationEnum.fadeIn) {
      const opacity = interpolate(pageFrame, [0, animationDuration], [0, 1], {
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }

    if (captionAnimation === CaptionAnimationEnum.slideUp) {
      const translateY = interpolate(pageFrame, [0, animationDuration], [50, 0], {
        extrapolateRight: 'clamp',
      });
      return { transform: `translateY(${translateY}px)` };
    }

    if (captionAnimation === CaptionAnimationEnum.scale) {
      const scale = spring({
        frame: pageFrame,
        fps,
        config: {
          damping: 100,
          stiffness: 200,
          mass: 0.5,
        },
      });
      return { transform: `scale(${scale})` };
    }

    return {};
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <Audio
        loop
        src={music.url}
        startFrom={music.start * fps}
        endAt={music.end * fps}
        volume={() => musicVolume}
        muted={musicMuted}
      />

      {scenes.map((scene, i) => {
        const { captions, audio, video } = scene;
        const pages = createCaptionPages({
          captions,
          lineMaxLength: 30,
          lineCount: 1,
          maxDistanceMs: 1000,
        });

        // Calculate the start and end time of the scene
        const startFrame =
          scenes.slice(0, i).reduce((acc, curr) => {
            return acc + curr.audio.duration;
          }, 0) * fps;
        let durationInFrames =
          scenes.slice(0, i + 1).reduce((acc, curr) => {
            return acc + curr.audio.duration;
          }, 0) * fps;
        if (config.paddingBack && i === scenes.length - 1) {
          durationInFrames += (config.paddingBack / 1000) * fps;
        }

        const sceneFrame = frame - startFrame;
        const transitionStyle = getTransitionStyle(sceneFrame, durationInFrames);
        const kenBurnsStyle = getKenBurnsStyle(sceneFrame, durationInFrames);

        return (
          <Sequence
            from={startFrame}
            durationInFrames={durationInFrames}
            key={`scene-${i}`}
          >
            <div style={{ ...transitionStyle, width: '100%', height: '100%' }}>
              <div style={{ ...kenBurnsStyle, width: '100%', height: '100%' }}>
                <OffthreadVideo
                  src={video}
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </div>
            <Audio src={audio.url} />
            {pages.map((page, j) => {
              const pageFrame = frame - startFrame - Math.round((page.startMs / 1000) * fps);
              const captionAnimStyle = getCaptionAnimationStyle(pageFrame);

              return (
                <Sequence
                  key={`scene-${i}-page-${j}`}
                  from={Math.round((page.startMs / 1000) * fps)}
                  durationInFrames={Math.round(
                    ((page.endMs - page.startMs) / 1000) * fps,
                  )}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: "100%",
                      ...captionStyle,
                      ...captionAnimStyle,
                    }}
                  >
                    {page.lines.map((line, k) => {
                      return (
                        <p
                          style={{
                            fontSize: captionFontSize,
                            fontFamily: captionFont,
                            fontWeight: "black",
                            color: "white",
                            WebkitTextStroke: "2px black",
                            WebkitTextFillColor: "white",
                            textShadow: "0px 0px 10px black",
                            textAlign: "center",
                            width: "100%",
                            textTransform: "uppercase",
                          }}
                          key={`scene-${i}-page-${j}-line-${k}`}
                        >
                          {line.texts.map((text, l) => {
                            const active =
                              frame >=
                                startFrame + (text.startMs / 1000) * fps &&
                              frame <= startFrame + (text.endMs / 1000) * fps;
                            return (
                              <>
                                <span
                                  style={{
                                    fontWeight: "bold",
                                    ...(active ? activeStyle : {}),
                                  }}
                                  key={`scene-${i}-page-${j}-line-${k}-text-${l}`}
                                >
                                  {text.text}
                                </span>
                                {l < line.texts.length - 1 ? " " : ""}
                              </>
                            );
                          })}
                        </p>
                      );
                    })}
                  </div>
                </Sequence>
              );
            })}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
