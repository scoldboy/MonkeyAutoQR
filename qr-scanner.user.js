// ==UserScript==
// @name         选区触发扫描二维码
// @namespace    https://github.com/qr-scanner-selection
// @version      1.1.0
// @description  鼠标拖动选中图片区域后出现扫描按钮，点击识别图片中的二维码，弹框显示链接
// @author       Claude
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 配置 ====================
  const CONFIG = {
    MIN_IMAGE_SIZE: 64,       // 最小图片尺寸（px），小于此值不触发
    Z_INDEX_BUTTON: 99999,    // 按钮 z-index
    Z_INDEX_MODAL: 100000,    // 弹框 z-index
  };

  // ==================== 状态管理 ====================
  let activeButtons = new Map(); // Map<HTMLImageElement, HTMLElement>  每张图片对应一个按钮
  let isScanning = false;        // 是否正在扫描中

  // ==================== CSS 样式注入 ====================
  function injectStyles() {
    const css = `
/* ========== 扫描按钮（选区触发） ========== */
.qr-scanner-btn {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 130px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #4A90D9;
  border-radius: 8px;
  background: #EBF3FC;
  color: #4A90D9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  z-index: ${CONFIG.Z_INDEX_BUTTON};
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.2);
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease, color 0.15s ease;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
}
.qr-scanner-btn:hover {
  background: #4A90D9;
  color: #FFFFFF;
}
.qr-scanner-btn .qr-scanner-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 按钮出现/消失动画状态 */
.qr-scanner-btn.qr-scanner-show {
  opacity: 1;
  transform: scale(1);
}
.qr-scanner-btn.qr-scanner-hide {
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
}

/* ========== 弹框遮罩 ========== */
.qr-scanner-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: ${CONFIG.Z_INDEX_MODAL};
  display: flex;
  align-items: center;
  justify-content: center;
  animation: qr-overlay-fadein 0.2s ease;
}
@keyframes qr-overlay-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ========== 弹框主体 ========== */
.qr-scanner-modal {
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
  animation: qr-modal-pop 0.2s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
@keyframes qr-modal-pop {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

/* ========== 弹框标题栏 ========== */
.qr-scanner-modal-header {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  background: #EBF3FC;
  color: #2C3E50;
  font-size: 14px;
  font-weight: 600;
  position: relative;
}
.qr-scanner-modal-close {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #7F8C8D;
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.qr-scanner-modal-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #2C3E50;
}

/* ========== 弹框内容区 ========== */
.qr-scanner-modal-body {
  padding: 20px;
}
.qr-scanner-url {
  display: block;
  width: 100%;
  padding: 12px;
  border: 1px solid #DCDFE6;
  border-radius: 8px;
  background: #FAFBFC;
  color: #4A90D9;
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 13px;
  word-break: break-all;
  line-height: 1.6;
  box-sizing: border-box;
  user-select: all;
}
.qr-scanner-message {
  text-align: center;
  color: #7F8C8D;
  font-size: 14px;
  padding: 12px 0;
  line-height: 1.6;
}
.qr-scanner-message.warning {
  color: #F39C12;
}

/* ========== 弹框按钮区 ========== */
.qr-scanner-modal-footer {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
}
.qr-scanner-btn-primary {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: #4A90D9;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.qr-scanner-btn-primary:hover {
  background: #357ABD;
}
.qr-scanner-btn-secondary {
  flex: 1;
  height: 40px;
  border: 1px solid #4A90D9;
  border-radius: 8px;
  background: #FFFFFF;
  color: #4A90D9;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.qr-scanner-btn-secondary:hover {
  background: #EBF3FC;
}
.qr-scanner-btn-single {
  width: 120px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: #4A90D9;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
  margin: 0 auto 20px;
  display: block;
}
.qr-scanner-btn-single:hover {
  background: #357ABD;
}

/* 复制成功状态 */
.qr-scanner-btn-secondary.copied {
  background: #27AE60;
  border-color: #27AE60;
  color: #FFFFFF;
}
`;

    GM_addStyle(css);
  }

  // ==================== 图片过滤 ====================
  /**
   * 判断图片是否应该触发扫描按钮
   * @param {HTMLImageElement} img
   * @returns {boolean}
   */
  function isQualifiedImage(img) {
    // 排除非 img 标签
    if (img.tagName !== 'IMG') return false;

    // 排除 SVG（无法直接绘制到 Canvas）
    if (img.src && img.src.endsWith('.svg')) return false;
    if (img instanceof SVGImageElement) return false;

    // 排除被隐藏的图片
    if (!img.offsetParent && img.getClientRects().length === 0) return false;
    if (img.style.display === 'none' || img.style.visibility === 'hidden') return false;

    // 排除过小的图片
    const rect = img.getBoundingClientRect();
    if (rect.width < CONFIG.MIN_IMAGE_SIZE || rect.height < CONFIG.MIN_IMAGE_SIZE) return false;

    return true;
  }

  // ==================== 选区检测 ====================
  /**
   * 判断两个矩形是否有交集
   * @param {DOMRect} a
   * @param {DOMRect} b
   * @returns {boolean}
   */
  function rectsIntersect(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  /**
   * 获取当前浏览器选区覆盖的所有符合条件的图片
   * @returns {HTMLImageElement[]}
   */
  function getSelectedImages() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];

    const range = selection.getRangeAt(0);
    const selectionRects = range.getClientRects();

    // 选区没有可视矩形（如全选后再点击），跳过
    if (selectionRects.length === 0) return [];

    const allImages = document.querySelectorAll('img');
    const matched = [];

    for (const img of allImages) {
      if (!isQualifiedImage(img)) continue;

      const imgRect = img.getBoundingClientRect();

      // 检查图片矩形与任意一个选区矩形是否有交集
      for (const selRect of selectionRects) {
        if (rectsIntersect(imgRect, selRect)) {
          matched.push(img);
          break;
        }
      }
    }

    return matched;
  }

  // ==================== 按钮定位 ====================
  /**
   * 计算按钮在视口中的最佳位置
   * @param {DOMRect} imgRect - 图片的 getBoundingClientRect
   * @returns {{ left: number, top: number }}
   */
  function calculateButtonPosition(imgRect) {
    const BTN_WIDTH = 130;
    const BTN_HEIGHT = 36;
    const GAP = 8; // 与图片的间距
    const EDGE_PADDING = 12; // 距视口边缘的安全距离

    // 默认位置：图片右上角外侧
    let left = imgRect.right + GAP;
    let top = imgRect.top;

    // 如果按钮超出视口右侧，改为图片左上角外侧（向左放）
    if (left + BTN_WIDTH > window.innerWidth - EDGE_PADDING) {
      left = imgRect.left - BTN_WIDTH - GAP;
    }

    // 如果向左也超出，放到图片内部右上角
    if (left < EDGE_PADDING) {
      left = imgRect.right - BTN_WIDTH - GAP;
    }

    // 如果按钮超出视口下边缘，向上调整
    if (top + BTN_HEIGHT > window.innerHeight - EDGE_PADDING) {
      top = window.innerHeight - BTN_HEIGHT - EDGE_PADDING;
    }

    // 确保不超出上边缘
    if (top < EDGE_PADDING) {
      top = EDGE_PADDING;
    }

    // 确保不超出左边缘
    if (left < EDGE_PADDING) {
      left = EDGE_PADDING;
    }

    return { left, top };
  }

  // ==================== 按钮管理（多按钮支持） ====================
  /**
   * 为指定图片创建扫描按钮
   * @param {HTMLImageElement} img
   * @returns {HTMLElement}
   */
  function createButton(img) {
    const btn = document.createElement('div');
    btn.className = 'qr-scanner-btn qr-scanner-hide';
    btn.innerHTML = `
      <svg class="qr-scanner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <line x1="14" y1="14" x2="20" y2="20" stroke-width="2.5" />
        <circle cx="17" cy="17" r="3.5" />
      </svg>
      <span>扫描二维码</span>
    `;

    document.body.appendChild(btn);
    activeButtons.set(img, btn);
    return btn;
  }

  /**
   * 在指定图片右上角显示按钮
   * @param {HTMLImageElement} img
   */
  function showButton(img) {
    const rect = img.getBoundingClientRect();
    const { left, top } = calculateButtonPosition(rect);

    // 如果该图片已有按钮则复用，否则创建
    let btn = activeButtons.get(img);
    if (!btn) {
      btn = createButton(img);
    }

    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    // 触发出现动画
    btn.classList.remove('qr-scanner-hide');
    btn.classList.add('qr-scanner-show');
  }

  /**
   * 隐藏并移除单张图片的按钮
   * @param {HTMLImageElement} img
   */
  function hideAndRemoveButton(img) {
    const btn = activeButtons.get(img);
    if (!btn) return;

    btn.classList.remove('qr-scanner-show');
    btn.classList.add('qr-scanner-hide');

    // 等动画播完再移除 DOM（动画 150ms，加 10ms 缓冲）
    setTimeout(() => {
      if (btn.classList.contains('qr-scanner-hide')) {
        btn.remove();
        activeButtons.delete(img);
      }
    }, 160);
  }

  /**
   * 隐藏并移除所有按钮
   */
  function hideAllButtons() {
    const entries = Array.from(activeButtons.entries());
    for (const [img, btn] of entries) {
      btn.classList.remove('qr-scanner-show');
      btn.classList.add('qr-scanner-hide');
      setTimeout(() => {
        if (btn.classList.contains('qr-scanner-hide')) {
          btn.remove();
          activeButtons.delete(img);
        }
      }, 160);
    }
  }

  // ==================== 二维码扫描核心 ====================

  /**
   * 点击扫描按钮的处理入口
   * @param {HTMLImageElement} img - 要扫描的图片
   */
  function handleScanClick(img) {
    if (isScanning) return; // 防止重复点击
    if (!img) return;

    // 隐藏其他按钮，仅保留当前操作的按钮
    for (const [otherImg, otherBtn] of activeButtons) {
      if (otherImg !== img) {
        hideAndRemoveButton(otherImg);
      }
    }

    // 更新按钮状态为扫描中
    isScanning = true;
    const btn = activeButtons.get(img);
    updateButtonState(btn, 'scanning');

    // 先尝试直接 Canvas 方式
    scanViaCanvas(img)
      .then((result) => {
        isScanning = false;
        const currentBtn = activeButtons.get(img);
        updateButtonState(currentBtn, 'default');
        if (result.success) {
          showResultModal(result.data);
        } else {
          showTipModal(result.message, 'warning');
        }
      })
      .catch((err) => {
        isScanning = false;
        const currentBtn = activeButtons.get(img);
        updateButtonState(currentBtn, 'default');
        console.error('[QR Scanner] 扫描失败:', err);
        showTipModal('扫描过程出错，请重试', 'warning');
      });
  }

  /**
   * 通过 Canvas 方式扫描图片中的二维码
   * @param {HTMLImageElement} img
   * @returns {Promise<{success: boolean, data?: string, message?: string}>}
   */
  function scanViaCanvas(img) {
    return new Promise((resolve) => {
      try {
        // 创建 Canvas
        const canvas = document.createElement('canvas');
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        // 防止扫描零尺寸图片
        if (naturalWidth === 0 || naturalHeight === 0) {
          resolve({
            success: false,
            message: '图片尚未加载完成，请稍后重试',
          });
          return;
        }

        // 限制最大尺寸，避免超大图片导致性能问题
        const MAX_SIZE = 1200;
        let drawWidth = naturalWidth;
        let drawHeight = naturalHeight;
        if (drawWidth > MAX_SIZE || drawHeight > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / drawWidth, MAX_SIZE / drawHeight);
          drawWidth = Math.round(drawWidth * ratio);
          drawHeight = Math.round(drawHeight * ratio);
        }

        canvas.width = drawWidth;
        canvas.height = drawHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, drawWidth, drawHeight);

        // 提取像素数据
        const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);

        // 调用 jsQR 识别
        const qrCode = jsQR(imageData.data, drawWidth, drawHeight, {
          inversionAttempts: 'dontInvert', // 先尝试不反转
        });

        if (qrCode && qrCode.data) {
          resolve({ success: true, data: qrCode.data });
          return;
        }

        // 如果没找到，尝试反转图像再识别（处理白底黑码 / 黑底白码两种情况）
        const qrCodeInverted = jsQR(imageData.data, drawWidth, drawHeight, {
          inversionAttempts: 'attemptBoth',
        });

        if (qrCodeInverted && qrCodeInverted.data) {
          resolve({ success: true, data: qrCodeInverted.data });
          return;
        }

        // 未检测到二维码
        resolve({
          success: false,
          message: '未在此图片中检测到二维码\n\n请确认图片包含清晰的二维码图案',
        });
      } catch (err) {
        // Canvas 被污染（跨域图片），尝试跨域降级方案
        if (err.name === 'SecurityError' || err.message.includes('tainted')) {
          resolve(scanViaXHR(img));
        } else {
          resolve({
            success: false,
            message: '图片无法读取，请尝试右键保存图片后手动扫描',
          });
        }
      }
    });
  }

  /**
   * 通过 GM_xmlhttpRequest 获取跨域图片后扫描
   * @param {HTMLImageElement} img
   * @returns {Promise<{success: boolean, data?: string, message?: string}>}
   */
  function scanViaXHR(img) {
    return new Promise((resolve) => {
      const imgSrc = img.src || img.currentSrc;
      if (!imgSrc || imgSrc.startsWith('data:')) {
        // data: URI 不应该出现 SecurityError，但如果走到这里，再试一次 Canvas
        resolve({
          success: false,
          message: '此图片受跨域限制，无法扫描\n\n建议：右键图片 → 另存为 → 拖入浏览器直接打开后扫描',
        });
        return;
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url: imgSrc,
        responseType: 'blob',
        timeout: 10000, // 10 秒超时
        onload: function (xhrResp) {
          if (xhrResp.status !== 200 || !xhrResp.response) {
            resolve({
              success: false,
              message: '此图片受跨域限制，无法扫描\n\n建议：右键图片 → 另存为 → 拖入浏览器直接打开后扫描',
            });
            return;
          }

          // 将 blob 转为 object URL，加载后再扫描
          const blobUrl = URL.createObjectURL(xhrResp.response);
          const tempImg = new Image();
          tempImg.onload = function () {
            URL.revokeObjectURL(blobUrl);
            // 递归调用 scanViaCanvas（此时是同源的 blob URL）
            scanViaCanvas(tempImg).then(resolve);
          };
          tempImg.onerror = function () {
            URL.revokeObjectURL(blobUrl);
            resolve({
              success: false,
              message: '此图片受跨域限制，无法扫描\n\n建议：右键图片 → 另存为 → 拖入浏览器直接打开后扫描',
            });
          };
          tempImg.src = blobUrl;
        },
        onerror: function () {
          resolve({
            success: false,
            message: '此图片受跨域限制，无法扫描\n\n建议：右键图片 → 另存为 → 拖入浏览器直接打开后扫描',
          });
        },
        ontimeout: function () {
          resolve({
            success: false,
            message: '图片加载超时，请检查网络后重试',
          });
        },
      });
    });
  }

  /**
   * 更新扫描按钮的状态文字和样式
   * @param {HTMLElement} btn - 按钮元素
   * @param {'default' | 'scanning'} state
   */
  function updateButtonState(btn, state) {
    if (!btn) return;
    const span = btn.querySelector('span');
    if (!span) return;

    if (state === 'scanning') {
      span.textContent = '扫描中...';
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.7';
    } else {
      span.textContent = '扫描二维码';
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    }
  }

  // ==================== 弹框系统 ====================

  /**
   * 显示二维码扫描结果弹框（成功时）
   * 包含：链接展示、复制按钮、打开按钮
   * @param {string} url - 扫描到的链接
   */
  function showResultModal(url) {
    // 移除已有弹框
    removeExistingModal();

    const overlay = document.createElement('div');
    overlay.className = 'qr-scanner-overlay';
    overlay.innerHTML = `
      <div class="qr-scanner-modal">
        <div class="qr-scanner-modal-header">
          🔗 二维码扫描结果
          <button class="qr-scanner-modal-close" title="关闭">&times;</button>
        </div>
        <div class="qr-scanner-modal-body">
          <div class="qr-scanner-url">${escapeHtml(url)}</div>
        </div>
        <div class="qr-scanner-modal-footer">
          <button class="qr-scanner-btn-secondary" id="qr-copy-btn">复制链接</button>
          <button class="qr-scanner-btn-primary" id="qr-open-btn">打开链接</button>
        </div>
      </div>
    `;

    // 绑定事件
    bindModalEvents(overlay);

    // 复制按钮
    const copyBtn = overlay.querySelector('#qr-copy-btn');
    copyBtn.addEventListener('click', () => {
      copyToClipboard(url, copyBtn);
    });

    // 打开按钮
    const openBtn = overlay.querySelector('#qr-open-btn');
    openBtn.addEventListener('click', () => {
      window.open(url, '_blank');
      removeExistingModal();
    });

    document.body.appendChild(overlay);
  }

  /**
   * 显示提示弹框（失败/警告时）
   * @param {string} message - 提示内容
   * @param {'warning' | 'info'} type - 类型
   */
  function showTipModal(message, type) {
    removeExistingModal();

    const msgClass = type === 'warning' ? 'qr-scanner-message warning' : 'qr-scanner-message';

    const overlay = document.createElement('div');
    overlay.className = 'qr-scanner-overlay';
    overlay.innerHTML = `
      <div class="qr-scanner-modal">
        <div class="qr-scanner-modal-header">
          提示
          <button class="qr-scanner-modal-close" title="关闭">&times;</button>
        </div>
        <div class="qr-scanner-modal-body">
          <p class="${msgClass}" style="white-space: pre-line;">${message}</p>
        </div>
        <button class="qr-scanner-btn-single">确定</button>
      </div>
    `;

    bindModalEvents(overlay);

    overlay.querySelector('.qr-scanner-btn-single').addEventListener('click', () => {
      removeExistingModal();
    });

    document.body.appendChild(overlay);
  }

  /**
   * 绑定弹框的通用关闭事件
   * @param {HTMLElement} overlay - 遮罩元素
   */
  function bindModalEvents(overlay) {
    const closeModal = () => removeExistingModal();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    overlay.querySelector('.qr-scanner-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', onKeyDown);

    // 弹框移除时同步清理键盘监听
    const observer = new MutationObserver(() => {
      if (!document.contains(overlay)) {
        document.removeEventListener('keydown', onKeyDown);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  /**
   * 移除已存在的弹框
   */
  function removeExistingModal() {
    const existing = document.querySelector('.qr-scanner-overlay');
    if (existing) existing.remove();
  }

  /**
   * 复制文本到剪贴板，并更新按钮状态
   * @param {string} text - 要复制的文本
   * @param {HTMLElement} btn - 复制按钮元素
   */
  function copyToClipboard(text, btn) {
    // 优先使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => onCopySuccess(btn))
        .catch(() => fallbackCopy(text, btn));
    } else {
      fallbackCopy(text, btn);
    }
  }

  /**
   * 降级复制方案（execCommand）
   */
  function fallbackCopy(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      onCopySuccess(btn);
    } catch (e) {
      // 复制失败，不做额外处理
    }
    document.body.removeChild(textarea);
  }

  /**
   * 复制成功后的按钮反馈
   * @param {HTMLElement} btn
   */
  function onCopySuccess(btn) {
    const originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 2000);
  }

  /**
   * 转义 HTML 特殊字符，防止 XSS
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ==================== 事件监听 ====================

  /**
   * 鼠标松开时检测选区，为覆盖的图片显示扫描按钮
   * @param {MouseEvent} e
   */
  function handleMouseUp(e) {
    // 排除弹框内的鼠标操作
    if (e.target.closest('.qr-scanner-overlay')) return;
    // 排除按钮上的操作（按钮点击由全局 click 处理）
    if (e.target.closest('.qr-scanner-btn')) return;

    // 延迟到下一个事件循环，确保浏览器选区已更新完毕
    setTimeout(() => {
      const selectedImages = getSelectedImages();

      if (selectedImages.length === 0) {
        // 没有选区覆盖图片：隐藏所有已有按钮
        if (activeButtons.size > 0) {
          hideAllButtons();
        }
        return;
      }

      // 检查选中的图片是否与当前已显示按钮的图片完全一致
      const currentImgs = new Set(activeButtons.keys());
      const newImgs = new Set(selectedImages);
      const isSame = currentImgs.size === newImgs.size &&
        [...currentImgs].every(img => newImgs.has(img));

      if (isSame) return; // 相同的图片，不做变化避免闪烁

      // 隐藏旧按钮，为新选中的图片显示按钮
      hideAllButtons();
      for (const img of selectedImages) {
        showButton(img);
      }
    }, 0);
  }

  /**
   * 全局点击处理：判断点击目标决定按钮显隐
   * @param {MouseEvent} e
   */
  function handleGlobalClick(e) {
    const target = e.target;

    // 点击了扫描按钮：扫描对应的图片，隐藏其他按钮
    const clickedBtn = target.closest('.qr-scanner-btn');
    if (clickedBtn) {
      // 找到该按钮关联的图片
      for (const [img, btn] of activeButtons) {
        if (btn === clickedBtn) {
          handleScanClick(img);
          return;
        }
      }
      return;
    }

    // 点击了弹框内部：不做处理
    if (target.closest('.qr-scanner-overlay')) return;

    // 点击了其他区域（空白处）：隐藏所有按钮
    if (activeButtons.size > 0) {
      hideAllButtons();
    }
  }

  /**
   * 页面滚动时更新所有按钮位置
   */
  function handleScroll() {
    if (activeButtons.size === 0) return;

    for (const [img, btn] of activeButtons) {
      if (!btn.classList.contains('qr-scanner-show')) continue;
      const rect = img.getBoundingClientRect();
      const { left, top } = calculateButtonPosition(rect);
      btn.style.left = left + 'px';
      btn.style.top = top + 'px';
    }
  }

  // ==================== 初始化 ====================
  function init() {
    injectStyles();

    // 监听 mouseup：检测浏览器选区是否覆盖了图片
    document.addEventListener('mouseup', handleMouseUp, { passive: true });

    // 全局点击：判断是否点击按钮 / 空白处来管理按钮显隐
    document.addEventListener('click', handleGlobalClick, { passive: true });

    // 滚动时更新按钮位置（使用 rAF 节流）
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          handleScroll();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    }, { passive: true });

    // 窗口大小变化时更新按钮位置
    window.addEventListener('resize', handleScroll, { passive: true });

    console.log('[QR Scanner] 选区触发扫描二维码脚本已启动 (v1.1.0)');
  }

  // ==================== 启动 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
