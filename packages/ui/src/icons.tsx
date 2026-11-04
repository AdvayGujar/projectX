import { Circle, Path, Rect, Svg } from "react-native-svg";
import type { ReactElement } from "react";

export const ICON_NAMES = [
  "menu",
  "more",
  "plus",
  "record",
  "copy",
  "regen",
  "play",
  "search",
  "close",
  "pin",
  "pencil",
  "trash",
  "mute",
  "folder",
  "bubble",
  "layers",
  "attach",
  "slides",
  "think",
  "chevron",
  "send",
  "stop",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconProps {
  readonly name: IconName;
  readonly color: string;
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function Icon({ name, color, size = 18, strokeWidth = 1.7 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {name === "menu" && <Path d="M4 7h16M4 12h16M4 17h16" />}
      {name === "more" && (
        <>
          <Circle cx="5.5" cy="12" r="1.5" fill={color} stroke="none" />
          <Circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
          <Circle cx="18.5" cy="12" r="1.5" fill={color} stroke="none" />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" />}
      {name === "record" && (
        <>
          <Circle cx="12" cy="12" r="8.4" />
          <Circle cx="12" cy="12" r="3" fill={color} stroke="none" />
        </>
      )}
      {name === "copy" && (
        <>
          <Rect x="9" y="9" width="11" height="11" rx="2.2" />
          <Path d="M15 5.5H6.5A1.5 1.5 0 0 0 5 7v8.5" />
        </>
      )}
      {name === "regen" && (
        <>
          <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <Path d="M19.8 4.2v5h-5" />
        </>
      )}
      {name === "play" && <Path d="M8.5 5.2 19 12 8.5 18.8z" />}
      {name === "search" && (
        <>
          <Circle cx="11" cy="11" r="6.4" />
          <Path d="M15.8 15.8 20 20" />
        </>
      )}
      {name === "close" && <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
      {name === "pin" && (
        <>
          <Path d="M9 4h6l-.8 5.4 3.8 3.6H6l3.8-3.6z" />
          <Path d="M12 13v7" />
        </>
      )}
      {name === "pencil" && <Path d="M4.5 19.5h4L20 8l-4-4L4.5 15.5z" />}
      {name === "trash" && <Path d="M5 7h14M10 7V4.5h4V7M7.5 7l.9 12.5h7.2L16.5 7" />}
      {name === "mute" && (
        <>
          <Path d="M4.5 9.5v5h3.6l4.4 3.5V6L8.1 9.5z" />
          <Path d="M16.5 9.5l4 5M20.5 9.5l-4 5" />
        </>
      )}
      {name === "folder" && <Path d="M3.5 7.5h6l1.8 2H20.5v9H3.5z" />}
      {name === "bubble" && <Path d="M20.5 11.6a7.6 7.6 0 0 1-7.6 7.6H8l-4 2.6v-5.1a7.6 7.6 0 1 1 16.5-5.1z" />}
      {name === "layers" && (
        <>
          <Path d="M12 3.5 20.5 8 12 12.5 3.5 8z" />
          <Path d="M3.5 12.5 12 17l8.5-4.5" />
        </>
      )}
      {name === "attach" && <Path d="M9 12.5 15.5 6a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7-7l7.6-7.6" />}
      {name === "slides" && (
        <>
          <Rect x="3.5" y="5" width="17" height="11" rx="1.4" />
          <Path d="M12 16v3.5M8 21h8" />
        </>
      )}
      {name === "think" && <Path d="M12 4.5v15M4.5 12h15M7 7l10 10M17 7 7 17" />}
      {name === "chevron" && <Path d="M9 6l6 6-6 6" />}
      {name === "send" && <Path d="M12 19V5M6 11l6-6 6 6" />}
      {name === "stop" && <Rect x="7" y="7" width="10" height="10" rx="2" fill={color} stroke="none" />}
    </Svg>
  );
}