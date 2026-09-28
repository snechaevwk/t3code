import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 104 57" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      {/* S: block strokes only, to match the N's geometric construction. */}
      <rect x="0" y="0" width="44" height="13" />
      <rect x="0" y="0" width="13" height="35" />
      <rect x="0" y="22" width="44" height="13" />
      <rect x="31" y="22" width="13" height="35" />
      <rect x="0" y="44" width="44" height="13" />
      {/* N: two stems plus a diagonal band of matching thickness. */}
      <rect x="54" y="0" width="13" height="57" />
      <rect x="91" y="0" width="13" height="57" />
      <polygon points="64,0 77,0 94,57 81,57" />
    </svg>
  );
}
