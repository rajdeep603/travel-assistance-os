/**
 * Prints one element on its own: a hidden frame gets a copy of it with the
 * page's stylesheets, so the app's sidebar, header and dialogs never reach
 * the paper, whatever page the element sits on.
 */
export async function printElement(element: HTMLElement, title: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    throw new Error("This browser can't print from the page.");
  }

  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join("");
  const safeTitle = title.replace(/[<>&"]/g, "");
  doc.open();
  doc.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${safeTitle}</title>${styles}` +
      `<style>@page{size:A4;margin:14mm}html,body{background:#fff}</style></head>` +
      `<body class="${document.body.className}">${element.outerHTML}</body></html>`
  );
  doc.close();

  // Wait for the stylesheets, images and fonts, or the page prints unstyled.
  await Promise.all(
    [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
      (link) => link.sheet ?? new Promise((done) => ((link.onload = done), (link.onerror = done)))
    )
  );
  await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((done) => ((img.onload = done), (img.onerror = done))))));
  await doc.fonts?.ready;

  const cleanUp = () => frame.remove();
  win.addEventListener("afterprint", cleanUp, { once: true });
  setTimeout(cleanUp, 60_000);
  win.focus();
  win.print();
}
