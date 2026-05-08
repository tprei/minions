export function render(artifact) {
  const chip = document.createElement("span");
  chip.className = "artifact-chip artifact-commit";
  chip.textContent = artifact.ref.slice(0, 8);
  return chip;
}
