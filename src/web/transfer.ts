/** Getting a file out of the page and into it, with nothing but the browser's own file dialogs. */

export function downloadText(filename: string, content: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ask for a file and hand over its text. `onText` is not called if the dialog is cancelled. */
export function pickTextFile(accept: string, onText: (text: string, name: string) => void, maxBytes = 1_000_000): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (file.size > maxBytes) return onText("", file.name); // too big to be what we want: let the caller say so
    void file.text().then((text) => onText(text, file.name));
  });
  document.body.appendChild(input);
  input.click();
}
