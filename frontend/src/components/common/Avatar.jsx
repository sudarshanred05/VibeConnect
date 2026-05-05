const MODULE_COLORS = {
  HR: "#3B5998",
  Payroll: "#2E7D6E",
  Finance: "#7B4B9E",
  Recruitment: "#C65B2A",
  "Time Management": "#1A6B8A",
  Performance: "#8A3B1A",
  Admin: "#4A5568",
  Employees: "#2D6A4F",
};

export const getInitials = (name = "") =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export const getModuleColor = (mod) => MODULE_COLORS[mod] || "#1E3A5F";

export default function Avatar({
  name,
  src,
  size = 36,
  online,
  module: mod,
  style = {},
}) {
  const initials = getInitials(name);
  const bg = getModuleColor(mod);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: size * 0.35,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.5px",
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: Math.max(8, size * 0.22),
            height: Math.max(8, size * 0.22),
            borderRadius: "50%",
            background: online ? "#22C55E" : "#94A3B8",
            border: "2px solid var(--surface)",
          }}
        />
      )}
    </div>
  );
}
