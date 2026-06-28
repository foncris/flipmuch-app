export default function Logo({ size = 28, color = "#a9824c", stroke = "#ffffff" }) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} aria-hidden="true">
      <path
        d="M62,86 L122,28 L182,86 C182,130 150,158 116,160"
        fill="none"
        stroke={stroke}
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M132,144 L96,166 L132,182 Z" fill={stroke} />
      <circle cx="108" cy="206" r="15" fill={color} />
    </svg>
  );
}
