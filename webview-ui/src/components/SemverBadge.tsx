interface Props {
  type: "major" | "minor" | "patch" | "none";
}

function SemverBadge({ type }: Props) {
  if (type === "none") return null;

  return (
    <span className={`semver-badge semver-${type}`}>
      {type.toUpperCase()}
    </span>
  );
}

export default SemverBadge;
