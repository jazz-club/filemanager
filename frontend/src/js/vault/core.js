var initialFolderId = (function () {
  var value = new URLSearchParams(window.location.search).get("folderId");
  var parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
})();
var currentFolderId = initialFolderId;
var currentFolderName = currentFolderId ? "Folder" : "/root";
var allLoadedFiles = [];
var allLoadedFolders = [];
var selectedFileIds = new Set();
var selectedFolderIds = new Set();
var inspectedFile = null;

function showConfirm(message, onConfirm, opts) {
  opts = opts || {};
  var modalEl = document.getElementById("confirmModal");
  if (!modalEl) {
    if (confirm(message)) onConfirm();
    return;
  }
  document.getElementById("confirm-modal-title").textContent = opts.title || "Confirm";
  document.getElementById("confirm-modal-body").textContent = message;
  var okBtn = document.getElementById("confirm-modal-ok");
  okBtn.textContent = opts.okLabel || "Confirm";
  okBtn.className = "btn btn-sm " + (opts.danger ? "btn-danger" : "btn-primary");
  var modal = new bootstrap.Modal(modalEl);
  var handler = function () {
    modal.hide();
    okBtn.removeEventListener("click", handler);
    onConfirm();
  };
  okBtn.addEventListener("click", handler);
  modalEl.addEventListener("hidden.bs.modal", function cleanup() {
    okBtn.removeEventListener("click", handler);
    modalEl.removeEventListener("hidden.bs.modal", cleanup);
  });
  modal.show();
}
function normalizeId(id) {
  var n = Number(id);
  return !isNaN(n) && String(id).trim() !== "" ? n : String(id);
}
function isFileSelected(id) {
  if (id === null || id === undefined) return false;
  return (
    selectedFileIds.has(id) || selectedFileIds.has(Number(id)) || selectedFileIds.has(String(id))
  );
}
function isFolderSelected(id) {
  if (id === null || id === undefined) return false;
  return (
    selectedFolderIds.has(id) ||
    selectedFolderIds.has(Number(id)) ||
    selectedFolderIds.has(String(id))
  );
}
function selectFile(id) {
  selectedFileIds.add(normalizeId(id));
}
function deselectFile(id) {
  selectedFileIds.delete(id);
  selectedFileIds.delete(Number(id));
  selectedFileIds.delete(String(id));
}
function toggleFileSelection(id, force) {
  var current = isFileSelected(id);
  var target = typeof force === "boolean" ? force : !current;
  if (target) selectFile(id);
  else deselectFile(id);
  updateSelectionUI();
}
function selectFolder(id) {
  selectedFolderIds.add(normalizeId(id));
}
function deselectFolder(id) {
  selectedFolderIds.delete(id);
  selectedFolderIds.delete(Number(id));
  selectedFolderIds.delete(String(id));
}
function toggleFolderSelection(id, force) {
  var current = isFolderSelected(id);
  var target = typeof force === "boolean" ? force : !current;
  if (target) selectFolder(id);
  else deselectFolder(id);
  updateSelectionUI();
}

var settingsOffcanvas = new bootstrap.Offcanvas(document.getElementById("settingsOffcanvas"));
var newFolderModal = new bootstrap.Modal(document.getElementById("newFolderModal"));
var renameModal = new bootstrap.Modal(document.getElementById("renameModal"));
var moveModal = new bootstrap.Modal(document.getElementById("moveModal"));
var deleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));
var changePasswordModal = new bootstrap.Modal(document.getElementById("changePasswordModal"));
var deleteAccountModal = new bootstrap.Modal(document.getElementById("deleteAccountModal"));
var videoModal = new bootstrap.Modal(document.getElementById("videoModal"));
var imageModal = new bootstrap.Modal(document.getElementById("imageModal"));
var docModal = new bootstrap.Modal(document.getElementById("docModal"));
var folderColorModal = new bootstrap.Modal(document.getElementById("folderColorModal"));
var shareModal = new bootstrap.Modal(document.getElementById("shareModal"));
var allSharesStatsModal = new bootstrap.Modal(document.getElementById("allSharesStatsModal"));

function getFileDownloadUrl(file) {
  if (!file) return "#";
  var token = file.download_token || file.id;
  return "/api/files/download/" + token;
}

var pendingAction = null;

var whoamiEl = document.getElementById("whoami");
var logoutBtn = document.getElementById("logout-btn");
var exportAllBtn = document.getElementById("export-all-btn");
var openChangePwBtn = document.getElementById("open-change-pw-btn");
var openDeleteAccountBtn = document.getElementById("open-delete-account-btn");

var refreshBtn = document.getElementById("refresh-btn");
var searchInput = document.getElementById("search-input");
var typeFilter = document.getElementById("type-filter");
var sortSelect = document.getElementById("sort-select");
var currentSortVal = "date-desc";
var currentFilterVal = "all";
var newFolderBtn = document.getElementById("new-folder-btn");

var fileInput = document.getElementById("file-input");
var startUploadBtn = document.getElementById("start-upload-btn");
var uploadTray = document.getElementById("upload-tray");
var uploadTrayCount = document.getElementById("upload-tray-count");
var uploadTrayItems = document.getElementById("upload-tray-items");
var closeUploadTrayBtn = document.getElementById("close-upload-tray-btn");

var batchActionBar = document.getElementById("batch-action-bar");
var batchSelectedSizeEl = document.getElementById("batch-selected-size");
var selectAllFilesCheckbox = document.getElementById("select-all-files");

var selectionDock = document.getElementById("selection-dock");
var selectionDockInfo = document.getElementById("selection-dock-info");
var batchSelectAllDockBtn = document.getElementById("batch-select-all-dock-btn");
var batchDeselectDockBtn = document.getElementById("batch-deselect-dock-btn");
var clearActivityBtn = document.getElementById("clear-activity-btn");

var currentViewMode = localStorage.getItem("vault_view_mode") || "list";
var showThumbnails = localStorage.getItem("vault_show_thumbs") !== "false";

var filterDropdownBtn = document.getElementById("filter-dropdown-btn");
var sortDropdownBtn = document.getElementById("sort-dropdown-btn");
var viewModeListBtn = document.getElementById("view-mode-list-btn");
var viewModeGridBtn = document.getElementById("view-mode-grid-btn");
var viewToggleThumbsBtn = document.getElementById("view-toggle-thumbs-btn");
var viewCheckList = document.getElementById("view-check-list");
var viewCheckGrid = document.getElementById("view-check-grid");
var viewCheckThumbs = document.getElementById("view-check-thumbs");

var audioDock = document.getElementById("audio-dock-player");
var audioDockEl = document.getElementById("audio-dock-el");
var audioDockTitle = document.getElementById("audio-dock-title");
var audioDockClose = document.getElementById("audio-dock-close");
var audioTrackCounter = document.getElementById("audio-track-counter");
var audioPlayPauseBtn = document.getElementById("audio-play-pause-btn");
var audioPrevBtn = document.getElementById("audio-prev-btn");
var audioNextBtn = document.getElementById("audio-next-btn");
var audioRwdBtn = document.getElementById("audio-rwd-btn");
var audioFwdBtn = document.getElementById("audio-fwd-btn");
var audioProgressWrap = document.getElementById("audio-progress-wrap");
var audioProgressFill = document.getElementById("audio-progress-fill");
var audioProgressHandle = document.getElementById("audio-progress-handle");
var audioCurrentTime = document.getElementById("audio-current-time");
var audioTotalTime = document.getElementById("audio-total-time");
var audioMuteBtn = document.getElementById("audio-mute-btn");
var audioVolumeSlider = document.getElementById("audio-volume-slider");
var currentAudioPlaylist = [];
var currentAudioIndex = 0;

var videoPlayerEl = document.getElementById("video-player-el");
var videoModalTitle = document.getElementById("video-modal-title");
var videoModalClose = document.getElementById("video-modal-close");
var videoCounterText = document.getElementById("video-counter-text");
var videoPrevBtn = document.getElementById("video-prev-btn");
var videoNextBtn = document.getElementById("video-next-btn");
var videoPlayPauseBtn = document.getElementById("video-play-pause-btn");
var videoRwdBtn = document.getElementById("video-rwd-btn");
var videoFwdBtn = document.getElementById("video-fwd-btn");
var videoMuteBtn = document.getElementById("video-mute-btn");
var videoVolumeSlider = document.getElementById("video-volume-slider");
var videoFullscreenBtn = document.getElementById("video-fullscreen-btn");
var videoProgressWrap = document.getElementById("video-progress-wrap");
var videoProgressFill = document.getElementById("video-progress-fill");
var videoCurrentTime = document.getElementById("video-current-time");
var videoTotalTime = document.getElementById("video-total-time");
var videoModalEl = document.getElementById("videoModal");
var currentVideoPlaylist = [];
var currentVideoIndex = 0;

var imageViewerEl = document.getElementById("image-viewer-el");
var imageModalTitle = document.getElementById("image-modal-title");
var imagePrevBtn = document.getElementById("image-prev-btn");
var imageNextBtn = document.getElementById("image-next-btn");
var imageCounterText = document.getElementById("image-counter-text");
var currentImageGallery = [];
var currentImageIndex = 0;

var dropOverlay = document.getElementById("drop-overlay");

function initializeVault() {
  api("/auth/me").then(function (r) {
    if (!r.ok) {
      window.location.href = "/login";
      return;
    }
    r.json().then(function (d) {
      whoamiEl.textContent = d.user;
      var mobileWho = document.querySelector(".whoami-mobile");
      if (mobileWho) mobileWho.textContent = d.user;
      loadVault();
      updateStorageStats();
    });
  });
}

logoutBtn.onclick = function () {
  api("/auth/logout", { method: "POST" }).then(function () {
    window.location.href = "/login";
  });
};

exportAllBtn.onclick = function () {
  window.location.href = "/api/files/export/all";
};

refreshBtn.onclick = function () {
  loadVault();
  updateStorageStats();
};
