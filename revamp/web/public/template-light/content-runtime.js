(() => {
  const applyContent = (content) => {
    if (!content) return false;

    if (content.metadata?.title) document.title = content.metadata.title;

    const description = document.querySelector('meta[name="description"]');
    if (description && content.metadata?.description) description.setAttribute("content", content.metadata.description);

    Object.values(content.bindings || {}).forEach((binding) => {
      const element = document.querySelector(binding.selector);
      if (!element || !binding.value) return;

      if (binding.attribute && binding.attribute !== "textContent") {
        element.setAttribute(binding.attribute, binding.value);
        return;
      }

      if (binding.preserveChildren && element.firstChild) {
        element.firstChild.nodeValue = binding.value;
        return;
      }

      element.textContent = binding.value;
    });

    return true;
  };

  const loadContent = async () => {
    try {
      const response = await fetch("/api/public/landing", { cache: "no-store" });
      if (!response.ok) return;
      const content = await response.json();

      let attempts = 0;
      const applyWhenReady = () => {
        const hasRoot = document.getElementById("ap-root");
        if (hasRoot && applyContent(content)) return;
        if (attempts++ < 20) window.setTimeout(applyWhenReady, 100);
      };

      applyWhenReady();
    } catch {
      // Template defaults remain visible if public content cannot be loaded.
    }
  };

  window.addEventListener("load", loadContent, { once: true });
})();
