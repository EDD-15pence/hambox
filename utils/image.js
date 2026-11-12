/**
 * 图片选择与压缩（C-04）
 *
 * 为什么不用 canvas 而用 `wx.compressImage` 反复压：
 *   canvas 要算尺寸、要 dpr、要处理 `canvasToTempFilePath` 的异步与各机型差异，
 *   为了「压到 500KB 以下」这点需求不值当。`compressImage` 每次都会重新解码编码，
 *   同一张图连压两次仍会变小，所以逐档试（80 → 60 → 40 → 20）总能落到限制内，
 *   压到最后一档还超标才放弃并如实报错。
 *
 * 体积拿不到时（老版本基础库没有 fs.stat）**不阻塞上传**：宁可传大一点，
 * 也不要因为量不出体积就让用户记不了这条。
 */

var MAX_BYTES = 500 * 1024;
var QUALITIES = [80, 60, 40, 20];

/**
 * 纯函数：要不要压、按什么顺序压。抽出来是为了能在 node 里单测 ——
 * 真机上的 `wx.compressImage` 没法在单测里跑。
 * @param {number} size 原始字节数，0 表示量不出来
 * @param {number} maxBytes
 * @returns {number[]} 要依次尝试的质量档；空数组 = 不用压
 */
function planQualities(size, maxBytes) {
  var limit = maxBytes || MAX_BYTES;
  if (!size || size <= limit) return [];
  return QUALITIES.slice();
}

/** 文件体积；量不出来返回 0（调用方当作「不知道」处理） */
function statSize(filePath) {
  return new Promise(function (resolve) {
    try {
      wx.getFileSystemManager().stat({
        path: filePath,
        success: function (res) {
          resolve((res && res.stats && res.stats.size) || 0);
        },
        fail: function () {
          resolve(0);
        }
      });
    } catch (e) {
      resolve(0);
    }
  });
}

function compressOnce(filePath, quality) {
  return new Promise(function (resolve, reject) {
    if (typeof wx.compressImage !== 'function') {
      reject(new Error('当前微信版本不支持压缩图片'));
      return;
    }
    wx.compressImage({
      src: filePath,
      quality: quality,
      success: function (res) {
        if (res && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('压缩后拿不到文件'));
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '压缩失败'));
      }
    });
  });
}

/**
 * 压到 maxBytes 以内。压不动就把最后一档的结果给你，别让调用方拿到空路径。
 * @returns {Promise<{path: string, size: number, compressed: boolean}>}
 */
function compressToLimit(filePath, maxBytes) {
  var limit = maxBytes || MAX_BYTES;
  return statSize(filePath).then(function (size) {
    var plan = planQualities(size, limit);
    if (!plan.length) {
      return { path: filePath, size: size, compressed: false };
    }
    return plan.reduce(function (chain, quality) {
      return chain.then(function (current) {
        if (current.size && current.size <= limit) return current;
        return compressOnce(current.path, quality)
          .then(function (nextPath) {
            return statSize(nextPath).then(function (nextSize) {
              return {
                path: nextPath,
                // 量不出来就沿用上一次的体积，避免把「不知道」当成「已经够小」
                size: nextSize || current.size,
                compressed: true
              };
            });
          })
          .catch(function () {
            // 这一档失败不影响后面，最后一档也失败就用当前结果
            return current;
          });
      });
    }, Promise.resolve({ path: filePath, size: size, compressed: false }));
  });
}

/** 选一张图（相册 / 拍照），返回本地临时路径 */
function chooseImage(sourceType) {
  return new Promise(function (resolve, reject) {
    var types = sourceType ? [sourceType] : ['album', 'camera'];
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: types,
        success: function (res) {
          var file = (res.tempFiles || [])[0];
          if (file && file.tempFilePath) resolve(file.tempFilePath);
          else reject(new Error('没选到图片'));
        },
        fail: function (err) {
          reject(new Error((err && err.errMsg) || '没选到图片'));
        }
      });
      return;
    }
    // 老基础库兜底：chooseImage 仍可用
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: types,
      success: function (res) {
        var path = (res.tempFilePaths || [])[0];
        if (path) resolve(path);
        else reject(new Error('没选到图片'));
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '没选到图片'));
      }
    });
  });
}

/** 选图 + 压到限制内，一步到位 */
function pickAndCompress(maxBytes) {
  return chooseImage().then(function (path) {
    return compressToLimit(path, maxBytes);
  });
}

/** 人类可读的体积，提示文案用 */
function readableSize(size) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
  return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = {
  MAX_BYTES: MAX_BYTES,
  planQualities: planQualities,
  statSize: statSize,
  compressToLimit: compressToLimit,
  chooseImage: chooseImage,
  pickAndCompress: pickAndCompress,
  readableSize: readableSize
};
