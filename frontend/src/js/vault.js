(function () {
  var files = [
    "/src/js/vault/core.js",
    "/src/js/vault/data.js",
    "/src/js/vault/list.js",
    "/src/js/vault/grid.js",
    "/src/js/vault/selection.js",
    "/src/js/vault/shares.js",
    "/src/js/vault/fileOperations.js",
    "/src/js/vault/folderInfo.js",
    "/src/js/vault/media.js",
    "/src/js/vault/uploads.js",
  ];
  files
    .reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var script = document.createElement("script");
          script.src = src;
          script.onload = resolve;
          script.onerror = function () {
            reject(new Error("Failed to load " + src));
          };
          document.body.appendChild(script);
        });
      });
    }, Promise.resolve())
    .then(function () {
      initializeVault();
    })
    .catch(function (error) {
      console.error("Vault initialization failed", error);
    });
})();
