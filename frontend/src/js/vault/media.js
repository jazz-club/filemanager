function loadAudioTrack(idx) {
  if (currentAudioPlaylist.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= currentAudioPlaylist.length) idx = currentAudioPlaylist.length - 1;
  currentAudioIndex = idx;

  var track = currentAudioPlaylist[currentAudioIndex];
  audioDock.classList.remove("d-none");
  document.body.classList.add("has-audio-dock");
  updateBatchBar();
  audioDockTitle.innerHTML =
    '<img src="/api/files/' +
    track.id +
    '/cover" width="22" height="22" class="rounded border border-dark flex-shrink-0" style="object-fit: cover; background: #f8f9fa; vertical-align: middle;" alt="" onerror="this.onerror=null; this.src=\'/src/assets/icons/lib/SVG/regular/headphones.svg\'; this.className=\'flex-shrink-0\'; this.style.border=\'none\'; this.style.background=\'none\'; this.style.objectFit=\'contain\';" />' +
    '<span class="text-truncate">' +
    escapeHtml(track.original_name) +
    "</span>";
  audioTrackCounter.textContent = currentAudioIndex + 1 + " / " + currentAudioPlaylist.length;

  var miniIcon = document.getElementById("audio-mini-icon");
  if (miniIcon) {
    miniIcon.src = "/api/files/" + track.id + "/cover";
    miniIcon.className = "rounded border border-dark flex-shrink-0";
    miniIcon.style.objectFit = "cover";
    miniIcon.onerror = function () {
      this.onerror = null;
      this.src = "/src/assets/icons/lib/SVG/regular/headphones.svg";
      this.className = "flex-shrink-0";
      this.style.border = "none";
      this.style.objectFit = "contain";
    };
  }

  audioDockEl.src = "/api/files/" + track.id + "/preview";
  audioDockEl.play().catch(function () {});
  audioPlayPauseBtn.textContent = "Pause";

  if (audioProgressFill) audioProgressFill.style.width = "0%";
  if (audioProgressHandle) audioProgressHandle.style.left = "0px";
  if (audioCurrentTime) audioCurrentTime.textContent = "0:00";

  audioPrevBtn.disabled = currentAudioIndex <= 0;
  audioNextBtn.disabled = currentAudioIndex >= currentAudioPlaylist.length - 1;
}

audioPlayPauseBtn.onclick = function () {
  if (audioDockEl.paused) {
    audioDockEl.play();
  } else {
    audioDockEl.pause();
  }
};

audioDockEl.onplay = function () {
  audioPlayPauseBtn.textContent = "Pause";
};

audioDockEl.onpause = function () {
  audioPlayPauseBtn.textContent = "Play";
};

var isDraggingAudioSeek = false;

function setAudioProgressFromPointer(e) {
  if (!audioDockEl.duration || !audioProgressWrap) return 0;
  var rect = audioProgressWrap.getBoundingClientRect();
  var clientX = e.clientX;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
  }
  var clickX = clientX - rect.left;
  var trackW = rect.width || audioProgressWrap.offsetWidth || 300;
  var ratio = Math.max(0, Math.min(1, clickX / trackW));
  var pct = ratio * 100;
  if (audioProgressFill) audioProgressFill.style.width = pct + "%";
  if (audioProgressHandle) {
    var maxLeft = Math.max(0, trackW - 14);
    var handleX = Math.max(0, Math.min(maxLeft, ratio * maxLeft));
    audioProgressHandle.style.left = handleX + "px";
  }
  if (audioCurrentTime)
    audioCurrentTime.textContent = formatMediaTime(ratio * audioDockEl.duration);
  return ratio;
}

audioDockEl.ontimeupdate = function () {
  if (!audioDockEl.duration || isDraggingAudioSeek) return;
  var ratio = Math.max(0, Math.min(1, audioDockEl.currentTime / audioDockEl.duration));
  var pct = ratio * 100;
  if (audioProgressFill) audioProgressFill.style.width = pct + "%";
  if (audioProgressHandle && audioProgressWrap) {
    var trackW =
      audioProgressWrap.offsetWidth || audioProgressWrap.getBoundingClientRect().width || 300;
    var maxLeft = Math.max(0, trackW - 14);
    var handleX = Math.max(0, Math.min(maxLeft, ratio * maxLeft));
    audioProgressHandle.style.left = handleX + "px";
  }
  if (audioCurrentTime) audioCurrentTime.textContent = formatMediaTime(audioDockEl.currentTime);
};

audioDockEl.onloadedmetadata = function () {
  audioTotalTime.textContent = formatMediaTime(audioDockEl.duration);
};

audioDockEl.onended = function () {
  if (currentAudioIndex < currentAudioPlaylist.length - 1) {
    loadAudioTrack(currentAudioIndex + 1);
  } else {
    audioPlayPauseBtn.textContent = "Play";
  }
};

audioPrevBtn.onclick = function () {
  if (currentAudioIndex > 0) {
    loadAudioTrack(currentAudioIndex - 1);
  }
};

audioNextBtn.onclick = function () {
  if (currentAudioIndex < currentAudioPlaylist.length - 1) {
    loadAudioTrack(currentAudioIndex + 1);
  }
};

audioRwdBtn.onclick = function () {
  audioDockEl.currentTime = Math.max(0, audioDockEl.currentTime - 10);
};

audioFwdBtn.onclick = function () {
  if (audioDockEl.duration) {
    audioDockEl.currentTime = Math.min(audioDockEl.duration, audioDockEl.currentTime + 10);
  }
};

if (audioProgressWrap) {
  audioProgressWrap.addEventListener("pointerdown", function (e) {
    if (!audioDockEl.duration) return;
    isDraggingAudioSeek = true;
    try {
      audioProgressWrap.setPointerCapture(e.pointerId);
    } catch (err) {}
    setAudioProgressFromPointer(e);
  });

  audioProgressWrap.addEventListener("pointermove", function (e) {
    if (!isDraggingAudioSeek) return;
    setAudioProgressFromPointer(e);
  });

  var finishAudioSeek = function (e) {
    if (!isDraggingAudioSeek) return;
    isDraggingAudioSeek = false;
    try {
      audioProgressWrap.releasePointerCapture(e.pointerId);
    } catch (err) {}
    var ratio = setAudioProgressFromPointer(e);
    if (audioDockEl.duration && ratio !== undefined) {
      audioDockEl.currentTime = ratio * audioDockEl.duration;
    }
  };

  audioProgressWrap.addEventListener("pointerup", finishAudioSeek);
  audioProgressWrap.addEventListener("pointercancel", finishAudioSeek);
}

function updateAudioMuteBtn() {
  if (!audioMuteBtn) return;
  var isMuted = audioDockEl.muted || audioDockEl.volume === 0;
  var icon = isMuted
    ? "/src/assets/icons/lib/SVG/regular/sound-mute.svg"
    : "/src/assets/icons/lib/SVG/regular/sound-on.svg";
  var text = isMuted ? "Unmute" : "Mute";
  audioMuteBtn.innerHTML =
    '<img src="' +
    icon +
    '" width="14" height="14" style="object-fit: contain; vertical-align: -2px; margin-right: 4px;" alt="" />' +
    text;
}

audioMuteBtn.onclick = function () {
  audioDockEl.muted = !audioDockEl.muted;
  updateAudioMuteBtn();
};

audioVolumeSlider.oninput = function () {
  audioDockEl.volume = parseFloat(this.value);
  if (audioDockEl.muted && audioDockEl.volume > 0) {
    audioDockEl.muted = false;
  }
  updateAudioMuteBtn();
};

function loadVideoTrack(idx) {
  if (currentVideoPlaylist.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= currentVideoPlaylist.length) idx = currentVideoPlaylist.length - 1;
  currentVideoIndex = idx;

  var item = currentVideoPlaylist[currentVideoIndex];
  videoModalTitle.innerHTML =
    '<img src="/src/assets/icons/file-video.png" width="18" height="18" style="image-rendering: pixelated; object-fit: contain; flex-shrink: 0; margin-right: 6px; vertical-align: -2px;" alt="" />' +
    '<span class="text-truncate">' +
    escapeHtml(item.original_name) +
    "</span>";
  videoCounterText.textContent = currentVideoIndex + 1 + " / " + currentVideoPlaylist.length;

  if (videoProgressFill) videoProgressFill.style.width = "0%";
  if (videoCurrentTime) videoCurrentTime.textContent = "0:00";
  if (videoTotalTime) videoTotalTime.textContent = "0:00";
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";

  videoPlayerEl.src = "/api/files/" + item.id + "/preview";
  videoPlayerEl
    .play()
    .then(function () {
      if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
    })
    .catch(function () {});

  videoPrevBtn.disabled = currentVideoIndex <= 0;
  videoNextBtn.disabled = currentVideoIndex >= currentVideoPlaylist.length - 1;
}

if (videoPlayPauseBtn && videoPlayerEl) {
  videoPlayPauseBtn.onclick = function () {
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };

  videoPlayerEl.onclick = function () {
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };

  videoPlayerEl.onplay = function () {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
  };

  videoPlayerEl.onpause = function () {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
  };

  videoPlayerEl.ontimeupdate = function () {
    if (!videoPlayerEl.duration) return;
    var pct = (videoPlayerEl.currentTime / videoPlayerEl.duration) * 100;
    if (videoProgressFill) videoProgressFill.style.width = pct + "%";
    if (videoCurrentTime) videoCurrentTime.textContent = formatMediaTime(videoPlayerEl.currentTime);
  };

  videoPlayerEl.onloadedmetadata = function () {
    if (videoTotalTime) videoTotalTime.textContent = formatMediaTime(videoPlayerEl.duration);
  };

  videoPlayerEl.onended = function () {
    if (currentVideoIndex < currentVideoPlaylist.length - 1) {
      loadVideoTrack(currentVideoIndex + 1);
    } else {
      if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
    }
  };

  if (videoRwdBtn) {
    videoRwdBtn.onclick = function () {
      videoPlayerEl.currentTime = Math.max(0, videoPlayerEl.currentTime - 10);
    };
  }

  if (videoFwdBtn) {
    videoFwdBtn.onclick = function () {
      if (videoPlayerEl.duration) {
        videoPlayerEl.currentTime = Math.min(
          videoPlayerEl.duration,
          videoPlayerEl.currentTime + 10
        );
      }
    };
  }

  if (videoProgressWrap) {
    videoProgressWrap.onclick = function (e) {
      if (!videoPlayerEl.duration) return;
      var rect = videoProgressWrap.getBoundingClientRect();
      var clickX = e.clientX - rect.left;
      var ratio = Math.max(0, Math.min(1, clickX / rect.width));
      videoPlayerEl.currentTime = ratio * videoPlayerEl.duration;
    };
  }

  function updateVideoMuteBtn() {
    if (!videoMuteBtn) return;
    var isMuted = videoPlayerEl.muted || videoPlayerEl.volume === 0;
    var icon = isMuted
      ? "/src/assets/icons/lib/SVG/regular/sound-mute.svg"
      : "/src/assets/icons/lib/SVG/regular/sound-on.svg";
    var text = isMuted ? "Unmute" : "Mute";
    videoMuteBtn.innerHTML =
      '<img src="' +
      icon +
      '" width="14" height="14" style="image-rendering: pixelated; vertical-align: -2px; margin-right: 4px;" alt="" />' +
      text;
  }

  if (videoMuteBtn) {
    videoMuteBtn.onclick = function () {
      videoPlayerEl.muted = !videoPlayerEl.muted;
      updateVideoMuteBtn();
    };
  }

  if (videoVolumeSlider) {
    videoVolumeSlider.oninput = function () {
      videoPlayerEl.volume = parseFloat(this.value);
      if (videoPlayerEl.muted && videoPlayerEl.volume > 0) {
        videoPlayerEl.muted = false;
      }
      updateVideoMuteBtn();
    };
  }

  if (videoFullscreenBtn) {
    videoFullscreenBtn.onclick = function () {
      var modalEl = document.getElementById("videoModal");
      var target = (modalEl && modalEl.querySelector(".modal-content")) || videoPlayerEl;
      if (!document.fullscreenElement) {
        if (target.requestFullscreen) {
          target.requestFullscreen();
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    };
  }

  if (videoModalEl) {
    videoModalEl.addEventListener("hidden.bs.modal", function () {
      if (!isVideoMinimized) {
        videoPlayerEl.pause();
        videoPlayerEl.removeAttribute("src");
      }
    });
  }
}

videoPrevBtn.onclick = function () {
  if (currentVideoIndex > 0) {
    loadVideoTrack(currentVideoIndex - 1);
  }
};

videoNextBtn.onclick = function () {
  if (currentVideoIndex < currentVideoPlaylist.length - 1) {
    loadVideoTrack(currentVideoIndex + 1);
  }
};

function openPreview(file, allFiles) {
  closeAllMenus();
  var mime = (file.mime_type || "").toLowerCase();
  var streamUrl = "/api/files/" + file.id + "/preview";

  if (mime.startsWith("audio/")) {
    currentAudioPlaylist = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("audio/");
    });
    currentAudioIndex = currentAudioPlaylist.findIndex(function (a) {
      return a.id === file.id;
    });
    if (currentAudioIndex === -1) currentAudioIndex = 0;
    loadAudioTrack(currentAudioIndex);
    return;
  }

  if (mime.startsWith("video/")) {
    currentVideoPlaylist = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("video/");
    });
    currentVideoIndex = currentVideoPlaylist.findIndex(function (v) {
      return v.id === file.id;
    });
    if (currentVideoIndex === -1) currentVideoIndex = 0;
    videoModal.show();
    loadVideoTrack(currentVideoIndex);
    return;
  }

  if (mime.startsWith("image/")) {
    currentImageGallery = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("image/");
    });
    currentImageIndex = currentImageGallery.findIndex(function (img) {
      return img.id === file.id;
    });
    if (currentImageIndex === -1) currentImageIndex = 0;
    updateLightbox();
    imageModal.show();
    return;
  }

  var isPdf = mime.includes("pdf") || (file.original_name || "").toLowerCase().endsWith(".pdf");
  var isText =
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("x-sh") ||
    /\.(txt|md|markdown|py|js|mjs|cjs|ts|tsx|jsx|json|html|htm|css|scss|less|c|cpp|h|hpp|rs|go|java|sh|bash|zsh|ps1|sql|yml|yaml|xml|svg|log|ini|conf|csv)$/i.test(
      file.original_name || ""
    );

  if (isPdf || isText) {
    document.getElementById("doc-modal-title").textContent = file.original_name;
    var pdfBox = document.getElementById("doc-pdf-container");
    var textBox = document.getElementById("doc-text-container");
    var iframe = document.getElementById("doc-pdf-iframe");
    var copyBtn = document.getElementById("doc-copy-btn");
    var langBadge = document.getElementById("doc-lang-badge");
    var metaStats = document.getElementById("doc-meta-stats");

    if (isPdf) {
      pdfBox.classList.remove("d-none");
      textBox.classList.add("d-none");
      iframe.src = streamUrl;
      if (copyBtn) copyBtn.classList.add("d-none");
      if (langBadge) langBadge.textContent = "PDF";
      if (metaStats) metaStats.textContent = "";
    } else {
      pdfBox.classList.add("d-none");
      textBox.classList.remove("d-none");
      if (copyBtn) copyBtn.classList.remove("d-none");
      if (langBadge) {
        var detectedLang = window.PinkBoxCodePreview
          ? window.PinkBoxCodePreview.detectLanguage(file.original_name, file.mime_type)
          : "TEXT";
        langBadge.textContent = detectedLang.toUpperCase();
      }
      if (metaStats) metaStats.textContent = "";

      textBox.innerHTML =
        '<div class="p-4 text-center text-muted font-monospace"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading code preview...</div>';

      fetch(streamUrl)
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to load text preview");
          return r.text();
        })
        .then(function (t) {
          if (window.PinkBoxCodePreview) {
            var highlighted = window.PinkBoxCodePreview.highlightCode(
              t,
              file.original_name,
              file.mime_type
            );
            textBox.innerHTML = highlighted.html;
            if (langBadge) langBadge.textContent = highlighted.lang;
            if (metaStats) {
              metaStats.textContent =
                highlighted.lineCount.toLocaleString() +
                " lines · " +
                formatBytes(highlighted.charCount);
            }
            if (copyBtn) {
              copyBtn.onclick = function () {
                navigator.clipboard.writeText(t).then(function () {
                  var copyText = document.getElementById("doc-copy-text");
                  if (copyText) {
                    copyText.textContent = "Copied!";
                    setTimeout(function () {
                      copyText.textContent = "Copy";
                    }, 2000);
                  }
                  if (typeof showToast === "function") {
                    showToast("Code copied to clipboard!", "success");
                  }
                });
              };
            }
          } else {
            textBox.textContent = t;
          }
        })
        .catch(function () {
          textBox.innerHTML =
            '<div class="p-4 text-center text-danger font-monospace">Could not load preview.</div>';
        });
    }
    docModal.show();
    return;
  }

  window.location.href = "/api/files/" + file.id;
}

function updateLightbox() {
  if (currentImageGallery.length === 0) return;
  var item = currentImageGallery[currentImageIndex];
  imageModalTitle.innerHTML =
    '<img src="/src/assets/icons/file-image.png" width="18" height="18" style="image-rendering: pixelated; object-fit: contain; flex-shrink: 0; margin-right: 6px; vertical-align: -2px;" alt="" />' +
    '<span class="text-truncate">' +
    escapeHtml(item.original_name) +
    "</span>";
  imageViewerEl.src = "/api/files/" + item.id + "/preview";
  imageCounterText.textContent = currentImageIndex + 1 + " / " + currentImageGallery.length;

  imagePrevBtn.disabled = currentImageIndex <= 0;
  imageNextBtn.disabled = currentImageIndex >= currentImageGallery.length - 1;
}

imagePrevBtn.onclick = function () {
  if (currentImageIndex > 0) {
    currentImageIndex--;
    updateLightbox();
  }
};

imageNextBtn.onclick = function () {
  if (currentImageIndex < currentImageGallery.length - 1) {
    currentImageIndex++;
    updateLightbox();
  }
};

var isVideoMinimized = false;
var videoModalMinimizeBtn = document.getElementById("video-modal-minimize");
var floatingVideoMini = document.getElementById("floating-video-mini");
var videoMiniViewport = document.getElementById("video-mini-viewport");
var videoMiniTitle = document.getElementById("video-mini-title");
var videoMiniExpandBtn = document.getElementById("video-mini-expand-btn");
var videoMiniCloseBtn = document.getElementById("video-mini-close-btn");
var videoMiniPlayBtn = document.getElementById("video-mini-play-btn");
var videoMiniTime = document.getElementById("video-mini-time");
var videoModalBody = document.querySelector("#videoModal .modal-body");

if (videoModalMinimizeBtn) {
  videoModalMinimizeBtn.onclick = function () {
    isVideoMinimized = true;
    videoModal.hide();
    if (floatingVideoMini && videoMiniViewport && videoPlayerEl) {
      floatingVideoMini.classList.remove("d-none");
      videoMiniViewport.appendChild(videoPlayerEl);
      if (videoMiniTitle) videoMiniTitle.textContent = videoModalTitle.textContent;
      if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = videoPlayerEl.paused ? "Play" : "Pause";
    }
  };
}

if (videoMiniExpandBtn) {
  videoMiniExpandBtn.onclick = function () {
    isVideoMinimized = false;
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
    if (videoModalBody && videoPlayerEl) {
      videoModalBody.appendChild(videoPlayerEl);
    }
    videoModal.show();
  };
}

if (videoMiniCloseBtn) {
  videoMiniCloseBtn.onclick = function () {
    isVideoMinimized = false;
    if (videoPlayerEl) {
      videoPlayerEl.pause();
      videoPlayerEl.removeAttribute("src");
    }
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
    if (videoModalBody && videoPlayerEl) {
      videoModalBody.appendChild(videoPlayerEl);
    }
  };
}

if (videoMiniPlayBtn) {
  videoMiniPlayBtn.onclick = function () {
    if (!videoPlayerEl) return;
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };
}

if (videoModalClose) {
  videoModalClose.onclick = function () {
    isVideoMinimized = false;
    videoPlayerEl.pause();
    videoPlayerEl.removeAttribute("src");
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
  };
}

document.getElementById("videoModal").addEventListener("hidden.bs.modal", function () {
  if (!isVideoMinimized) {
    videoPlayerEl.pause();
    videoPlayerEl.removeAttribute("src");
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
  }
});

videoPlayerEl.addEventListener("play", function () {
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
  if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = "Pause";
});
videoPlayerEl.addEventListener("pause", function () {
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
  if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = "Play";
});
videoPlayerEl.addEventListener("timeupdate", function () {
  if (videoMiniTime && videoPlayerEl.duration) {
    videoMiniTime.textContent =
      formatDuration(videoPlayerEl.currentTime) + " / " + formatDuration(videoPlayerEl.duration);
  }
});

var audioDockMinimizeBtn = document.getElementById("audio-dock-minimize");
var audioMiniPill = document.getElementById("audio-mini-pill");
var audioMiniTitle = document.getElementById("audio-mini-title");
var audioMiniPlayBtn = document.getElementById("audio-mini-play-btn");
var audioMiniExpandBtn = document.getElementById("audio-mini-expand-btn");
var audioMiniCloseBtn = document.getElementById("audio-mini-close-btn");

if (audioDockMinimizeBtn) {
  audioDockMinimizeBtn.onclick = function () {
    audioDock.classList.add("d-none");
    document.body.classList.remove("has-audio-dock");
    if (audioMiniPill) {
      audioMiniPill.classList.remove("d-none");
      if (audioMiniTitle) audioMiniTitle.textContent = audioDockTitle.textContent;
      if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = audioDockEl.paused ? "Play" : "Pause";
    }
    updateBatchBar();
  };
}

if (audioMiniExpandBtn) {
  audioMiniExpandBtn.onclick = function () {
    if (audioMiniPill) audioMiniPill.classList.add("d-none");
    if (audioDock) {
      audioDock.classList.remove("d-none");
      document.body.classList.add("has-audio-dock");
      updateBatchBar();
    }
  };
}

if (audioMiniCloseBtn) {
  audioMiniCloseBtn.onclick = function () {
    if (audioDockEl) {
      audioDockEl.pause();
      audioDockEl.removeAttribute("src");
    }
    if (audioMiniPill) audioMiniPill.classList.add("d-none");
    document.body.classList.remove("has-audio-dock");
    updateBatchBar();
  };
}

if (audioMiniPlayBtn) {
  audioMiniPlayBtn.onclick = function () {
    if (!audioDockEl) return;
    if (audioDockEl.paused) {
      audioDockEl.play().catch(function () {});
    } else {
      audioDockEl.pause();
    }
  };
}

audioDockClose.onclick = function () {
  audioDockEl.pause();
  audioDockEl.removeAttribute("src");
  audioDock.classList.add("d-none");
  document.body.classList.remove("has-audio-dock");
  updateBatchBar();
  if (audioMiniPill) audioMiniPill.classList.add("d-none");
};

audioDockEl.addEventListener("play", function () {
  if (audioPlayPauseBtn) audioPlayPauseBtn.textContent = "Pause";
  if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = "Pause";
});
audioDockEl.addEventListener("pause", function () {
  if (audioPlayPauseBtn) audioPlayPauseBtn.textContent = "Play";
  if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = "Play";
});
