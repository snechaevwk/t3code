import type { SVGProps } from "react";

// OM Code fork: a block "OM" glyph replaces the T3 wordmark. The export name
// stays so every upstream call site keeps working.
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        d="M0 0H44V56H0ZM10 10V46H34V10ZM52 56V0H62L76 22L90 0H100V56H90V20L76 42L62 20V56Z"
        fill="currentColor"
      />
    </svg>
  );
}
