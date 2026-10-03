import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

/**
 * OM Code fork: a block "OM" glyph, matching apps/web T3Wordmark. The export
 * name stays so upstream call sites keep working. Width derives from the
 * viewBox aspect ratio.
 */
export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 100 / 56;
  return (
    <Svg
      accessibilityLabel="OM"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="0 0 100 56"
    >
      <ThemedPath
        fillRule="evenodd"
        d="M0 0H44V56H0ZM10 10V46H34V10ZM52 56V0H62L76 22L90 0H100V56H90V20L76 42L62 20V56Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
