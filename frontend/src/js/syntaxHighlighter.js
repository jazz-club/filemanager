(function (root) {
  "use strict";

  function detectLanguage(filename, mime) {
    const ext = (filename || "").split(".").pop().toLowerCase();
    const m = (mime || "").toLowerCase();

    if (ext === "json" || m.includes("json")) return "json";
    if (["js", "mjs", "cjs"].includes(ext) || m.includes("javascript")) return "javascript";
    if (["ts", "mts", "cts"].includes(ext) || m.includes("typescript")) return "typescript";
    if (["jsx", "tsx"].includes(ext)) return "jsx";
    if (["py", "pyw"].includes(ext) || m.includes("python")) return "python";
    if (["html", "htm"].includes(ext) || m.includes("html")) return "html";
    if (["css", "scss", "less"].includes(ext) || m.includes("css")) return "css";
    if (["md", "markdown"].includes(ext) || m.includes("markdown")) return "markdown";
    if (["sql"].includes(ext) || m.includes("sql")) return "sql";
    if (["sh", "bash", "zsh"].includes(ext) || m.includes("x-sh")) return "bash";
    if (["ps1", "psm1"].includes(ext)) return "powershell";
    if (["c", "h"].includes(ext)) return "c";
    if (["cpp", "cc", "cxx", "hpp"].includes(ext)) return "cpp";
    if (["rs"].includes(ext)) return "rust";
    if (["go"].includes(ext)) return "go";
    if (["java"].includes(ext)) return "java";
    if (["yml", "yaml"].includes(ext) || m.includes("yaml")) return "yaml";
    if (["xml", "svg"].includes(ext) || m.includes("xml")) return "xml";

    return "text";
  }

  const KEYWORDS = {
    javascript: [
      "async",
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "export",
      "extends",
      "finally",
      "for",
      "from",
      "function",
      "get",
      "if",
      "import",
      "in",
      "instanceof",
      "let",
      "new",
      "null",
      "of",
      "return",
      "set",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "typeof",
      "undefined",
      "var",
      "void",
      "while",
      "with",
      "yield",
      "true",
      "false",
    ],
    typescript: [
      "async",
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "enum",
      "export",
      "extends",
      "finally",
      "for",
      "from",
      "function",
      "get",
      "if",
      "implements",
      "import",
      "in",
      "instanceof",
      "interface",
      "let",
      "new",
      "null",
      "of",
      "package",
      "private",
      "protected",
      "public",
      "readonly",
      "return",
      "set",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "type",
      "typeof",
      "undefined",
      "var",
      "void",
      "while",
      "with",
      "yield",
      "true",
      "false",
      "any",
      "string",
      "number",
      "boolean",
    ],
    python: [
      "and",
      "as",
      "assert",
      "async",
      "await",
      "break",
      "class",
      "continue",
      "def",
      "del",
      "elif",
      "else",
      "except",
      "False",
      "finally",
      "for",
      "from",
      "global",
      "if",
      "import",
      "in",
      "is",
      "lambda",
      "None",
      "nonlocal",
      "not",
      "or",
      "pass",
      "raise",
      "return",
      "True",
      "try",
      "while",
      "with",
      "yield",
      "self",
    ],
    sql: [
      "SELECT",
      "FROM",
      "WHERE",
      "INSERT",
      "INTO",
      "UPDATE",
      "DELETE",
      "JOIN",
      "INNER",
      "LEFT",
      "RIGHT",
      "FULL",
      "OUTER",
      "ON",
      "GROUP",
      "BY",
      "ORDER",
      "HAVING",
      "LIMIT",
      "OFFSET",
      "CREATE",
      "TABLE",
      "INDEX",
      "DROP",
      "ALTER",
      "ADD",
      "COLUMN",
      "SET",
      "DEFAULT",
      "NOT",
      "NULL",
      "PRIMARY",
      "KEY",
      "FOREIGN",
      "REFERENCES",
      "CASCADE",
      "UNION",
      "ALL",
      "DISTINCT",
      "AND",
      "OR",
      "IN",
      "IS",
      "LIKE",
      "ILIKE",
      "EXISTS",
      "BETWEEN",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
      "AS",
      "COUNT",
      "SUM",
      "AVG",
      "MIN",
      "MAX",
    ],
    bash: [
      "if",
      "then",
      "else",
      "elif",
      "fi",
      "case",
      "esac",
      "for",
      "select",
      "while",
      "until",
      "do",
      "done",
      "in",
      "function",
      "time",
      "source",
      "alias",
      "bg",
      "bind",
      "break",
      "builtin",
      "cd",
      "command",
      "compgen",
      "complete",
      "continue",
      "declare",
      "dirs",
      "disown",
      "echo",
      "enable",
      "eval",
      "exec",
      "exit",
      "export",
      "fc",
      "fg",
      "getopts",
      "hash",
      "help",
      "history",
      "jobs",
      "kill",
      "let",
      "local",
      "logout",
      "popd",
      "printf",
      "pushd",
      "pwd",
      "read",
      "readonly",
      "return",
      "set",
      "shift",
      "shopt",
      "suspend",
      "test",
      "times",
      "trap",
      "type",
      "typeset",
      "ulimit",
      "umask",
      "unalias",
      "unset",
      "wait",
    ],
    c: [
      "auto",
      "break",
      "case",
      "char",
      "const",
      "continue",
      "default",
      "do",
      "double",
      "else",
      "enum",
      "extern",
      "float",
      "for",
      "goto",
      "if",
      "int",
      "long",
      "register",
      "return",
      "short",
      "signed",
      "sizeof",
      "static",
      "struct",
      "switch",
      "typedef",
      "union",
      "unsigned",
      "void",
      "volatile",
      "while",
      "NULL",
      "true",
      "false",
    ],
    cpp: [
      "auto",
      "break",
      "case",
      "char",
      "const",
      "continue",
      "default",
      "do",
      "double",
      "else",
      "enum",
      "extern",
      "float",
      "for",
      "goto",
      "if",
      "int",
      "long",
      "register",
      "return",
      "short",
      "signed",
      "sizeof",
      "static",
      "struct",
      "switch",
      "typedef",
      "union",
      "unsigned",
      "void",
      "volatile",
      "while",
      "class",
      "namespace",
      "template",
      "typename",
      "this",
      "friend",
      "virtual",
      "inline",
      "explicit",
      "export",
      "mutable",
      "public",
      "protected",
      "private",
      "new",
      "delete",
      "operator",
      "throw",
      "try",
      "catch",
      "using",
      "nullptr",
      "true",
      "false",
      "constexpr",
      "override",
      "final",
    ],
    rust: [
      "as",
      "break",
      "const",
      "continue",
      "crate",
      "else",
      "enum",
      "extern",
      "false",
      "fn",
      "for",
      "if",
      "impl",
      "in",
      "let",
      "loop",
      "match",
      "mod",
      "move",
      "mut",
      "pub",
      "ref",
      "return",
      "self",
      "Self",
      "static",
      "struct",
      "super",
      "trait",
      "true",
      "type",
      "unsafe",
      "use",
      "where",
      "while",
      "async",
      "await",
      "dyn",
      "Some",
      "None",
      "Ok",
      "Err",
    ],
    go: [
      "break",
      "default",
      "func",
      "interface",
      "select",
      "case",
      "defer",
      "go",
      "map",
      "struct",
      "chan",
      "else",
      "goto",
      "package",
      "switch",
      "const",
      "fallthrough",
      "if",
      "range",
      "type",
      "continue",
      "for",
      "import",
      "return",
      "var",
      "nil",
      "true",
      "false",
    ],
    java: [
      "abstract",
      "assert",
      "boolean",
      "break",
      "byte",
      "case",
      "catch",
      "char",
      "class",
      "const",
      "continue",
      "default",
      "do",
      "double",
      "else",
      "enum",
      "extends",
      "final",
      "finally",
      "float",
      "for",
      "goto",
      "if",
      "implements",
      "import",
      "instanceof",
      "int",
      "interface",
      "long",
      "native",
      "new",
      "package",
      "private",
      "protected",
      "public",
      "return",
      "short",
      "static",
      "strictfp",
      "super",
      "switch",
      "synchronized",
      "this",
      "throw",
      "throws",
      "transient",
      "try",
      "void",
      "volatile",
      "while",
      "true",
      "false",
      "null",
    ],
  };

  KEYWORDS.jsx = KEYWORDS.typescript;

  function highlightJSON(code) {
    return code.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        let cls = "hl-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "hl-key";
            return (
              '<span class="' +
              cls +
              '">' +
              escapeHtml(match.slice(0, -1)) +
              '</span><span class="hl-punctuation">:</span>'
            );
          } else {
            cls = "hl-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "hl-boolean";
        } else if (/null/.test(match)) {
          cls = "hl-null";
        }
        return '<span class="' + cls + '">' + escapeHtml(match) + "</span>";
      }
    );
  }

  function highlightHTML(code) {
    return code
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>')
      .replace(
        /(&lt;\/?)([a-zA-Z0-9\-]+)([\s\S]*?)(\/?&gt;)/g,
        function (_, open, tag, attrs, close) {
          const highlightedAttrs = attrs.replace(
            /([a-zA-Z0-9\-]+)(=)(["'][^"']*["'])/g,
            '<span class="hl-attr">$1</span><span class="hl-operator">$2</span><span class="hl-string">$3</span>'
          );
          return (
            '<span class="hl-bracket">' +
            open +
            '</span><span class="hl-tag">' +
            tag +
            "</span>" +
            highlightedAttrs +
            '<span class="hl-bracket">' +
            close +
            "</span>"
          );
        }
      );
  }

  function highlightGeneric(code, lang) {
    const kwList = KEYWORDS[lang] || KEYWORDS.javascript;
    const kwRegex = new RegExp(
      "\\b(" + kwList.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
      lang === "sql" ? "gi" : "g"
    );

    const tokens = [];
    const pushToken = (type, val) => {
      const idx = tokens.length;
      tokens.push('<span class="' + type + '">' + escapeHtml(val) + "</span>");
      return "___PB_TOK_" + idx + "___";
    };

    let processed = code;

    if (["python", "bash", "powershell", "yaml"].includes(lang)) {
      processed = processed.replace(/(#.*$)/gm, (_, c) => pushToken("hl-comment", c));
    } else if (lang === "sql") {
      processed = processed.replace(/(--.*$)/gm, (_, c) => pushToken("hl-comment", c));
      processed = processed.replace(/(\/\*[\s\S]*?\*\/)/g, (_, c) => pushToken("hl-comment", c));
    } else {
      processed = processed.replace(/(\/\*[\s\S]*?\*\/)/g, (_, c) => pushToken("hl-comment", c));
      processed = processed.replace(/(\/\/.*$)/gm, (_, c) => pushToken("hl-comment", c));
    }

    processed = processed.replace(/(`[\s\S]*?`)/g, (_, s) => pushToken("hl-string", s));
    processed = processed.replace(/("(\\.|[^"\\])*")/g, (_, s) => pushToken("hl-string", s));
    processed = processed.replace(/('(\\.|[^'\\])*')/g, (_, s) => pushToken("hl-string", s));

    processed = processed.replace(/\b(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b/g, (_, n) =>
      pushToken("hl-number", n)
    );

    processed = processed.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, (_, f) =>
      pushToken("hl-function", f)
    );

    processed = escapeHtml(processed);

    processed = processed.replace(kwRegex, '<span class="hl-keyword">$1</span>');

    processed = processed.replace(/___PB_TOK_(\d+)___/g, (_, id) => tokens[parseInt(id, 10)] || "");

    return processed;
  }

  function highlightCode(rawCode, filename, mime) {
    if (typeof rawCode !== "string") rawCode = String(rawCode || "");
    const lang = detectLanguage(filename, mime);

    let html = "";
    if (lang === "json") {
      html = highlightJSON(escapeHtml(rawCode));
    } else if (lang === "html" || lang === "xml") {
      html = highlightHTML(escapeHtml(rawCode));
    } else if (lang === "text") {
      html = escapeHtml(rawCode);
    } else {
      html = highlightGeneric(rawCode, lang);
    }

    const lines = html.split(/\r\n|\r|\n/);
    const lineCount = lines.length;

    let outputHtml = '<div class="code-preview-wrap">';
    outputHtml += '<div class="code-lines-container">';

    for (let i = 0; i < lineCount; i++) {
      const lineNum = i + 1;
      const lineContent = lines[i] === "" ? "&nbsp;" : lines[i];
      outputHtml +=
        '<div class="code-line">' +
        '<span class="code-line-num" data-line-number="' +
        lineNum +
        '">' +
        lineNum +
        "</span>" +
        '<span class="code-line-content">' +
        lineContent +
        "</span>" +
        "</div>";
    }

    outputHtml += "</div></div>";

    return {
      html: outputHtml,
      lang: lang.toUpperCase(),
      lineCount,
      charCount: rawCode.length,
      rawCode,
    };
  }

  root.PinkBoxHighlighter = {
    detectLanguage,
    highlightCode,
    escapeHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
