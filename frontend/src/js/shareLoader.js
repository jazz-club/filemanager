(function () {
  var partials = Array.prototype.slice.call(document.querySelectorAll("[data-partial]"));
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(script);
    });
  }
  Promise.all(
    partials.map(function (target) {
      return fetch(target.getAttribute("data-partial"), { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("Failed to load page partial");
          return response.text();
        })
        .then(function (html) {
          target.outerHTML = html;
        });
    })
  )
    .then(function () {
      return loadScript("/src/js/bootstrap.bundle.min.js");
    })
    .then(function () {
      return loadScript("/src/js/common.js");
    })
    .then(function () {
      return loadScript("/src/js/utils/dom.js");
    })
    .then(function () {
      return loadScript("/src/js/utils/formatters.js");
    })
    .then(function () {
      return loadScript("/src/js/utils/icons.js");
    })
    .then(function () {
      return loadScript("/src/js/vendor/prism/prism.min.js");
    })
    .then(function () {
      return loadScript("/src/js/codePreview.js");
    })
    .then(function () {
      return loadScript("/src/js/share.js");
    })
    .catch(function (error) {
      console.error("Share page initialization failed", error);
    });
})();
