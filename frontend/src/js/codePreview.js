(function (root) {
  "use strict";

  function detectLanguage(filename, mime) {
    var name = (filename || "").toLowerCase();
    var type = (mime || "").toLowerCase();
    var extension = name.includes(".") ? name.split(".").pop() : "";

    if (type.includes("json")) return "json";
    if (type.includes("javascript")) return "javascript";
    if (type.includes("typescript")) return "typescript";
    if (type.includes("python")) return "python";
    if (type.includes("html")) return "markup";
    if (type.includes("xml")) return "markup";
    if (type.includes("css")) return "css";
    if (type.includes("markdown")) return "markdown";
    if (type.includes("sql")) return "sql";
    if (type.includes("yaml")) return "yaml";
    if (type.includes("x-sh")) return "bash";

    if (["js", "mjs", "cjs"].includes(extension)) return "javascript";
    if (["ts", "mts", "cts"].includes(extension)) return "typescript";
    if (extension === "jsx") return "jsx";
    if (extension === "tsx") return "tsx";
    if (["py", "pyw"].includes(extension)) return "python";
    if (["html", "htm", "xml", "svg"].includes(extension)) return "markup";
    if (["css", "scss", "less"].includes(extension)) return "css";
    if (["md", "markdown"].includes(extension)) return "markdown";
    if (extension === "sql") return "sql";
    if (["sh", "bash", "zsh"].includes(extension)) return "bash";
    if (["ps1", "psm1"].includes(extension)) return "powershell";
    if (["c", "h"].includes(extension)) return "c";
    if (["cpp", "cc", "cxx", "hpp"].includes(extension)) return "cpp";
    if (extension === "rs") return "rust";
    if (extension === "go") return "go";
    if (extension === "java") return "java";
    if (["yml", "yaml"].includes(extension)) return "yaml";

    return "text";
  }

  function highlightCode(rawCode, filename, mime) {
    var codeText = typeof rawCode === "string" ? rawCode : String(rawCode || "");
    var language = detectLanguage(filename, mime);
    var pre = document.createElement("pre");
    var code = document.createElement("code");

    pre.className = "line-numbers";
    code.className = "language-" + language;
    code.textContent = codeText;
    pre.appendChild(code);

    if (root.Prism) root.Prism.highlightElement(code);

    return {
      html: pre.outerHTML,
      lang: language.toUpperCase(),
      lineCount: codeText.split(/\r\n|\r|\n/).length,
      charCount: codeText.length,
      rawCode: codeText,
    };
  }

  root.PinkBoxCodePreview = {
    detectLanguage: detectLanguage,
    highlightCode: highlightCode,
  };
})(typeof window !== "undefined" ? window : globalThis);
