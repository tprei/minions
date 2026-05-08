export function render(artifact) {
  const chip = document.createElement("span");
  chip.className = "artifact-chip artifact-branch";
  chip.textContent = `⎷ ${artifact.ref}`;
  return chip;
}
