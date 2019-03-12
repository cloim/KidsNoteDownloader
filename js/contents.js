const BASE_URI = "https://www.kidsnote.com";
const ROLE_URL = "/accounts/role/name/";
const DATE_SELECTOR = "span[class='date']:first";
const REPORTS_DATE_FORMAT = "YYYY년 MM월 DD일";
const ALBUMS_DATE_FORMAT = "YYYY.MM.DD. (ddd) A hh:mm";
const IMG_CHECKED = chrome.extension.getURL("images/checked.png");
const IMG_UNCHECKED = chrome.extension.getURL("images/unchecked.png");

var OPTIONS = {
  nickname: {
    use: 'off',
    name: ''
  },
  child: {
    use: 'off',
    name: ''
  },
  term: {
    use: 'off',
    prev_date: []
  },
  down_delay: 100
}
var CUR_MENU = "";
var CUR_POS = {};
var PROGRESS_MODAL;

$(document).mousemove(event => {
  CUR_POS.x = event.pageX;
  CUR_POS.y = event.pageY;
});

$("ul[class='nav header-nav header-right'] li.dropdown").on("click", e => {
  $("ul[class='nav header-nav header-right'] li.dropdown").toggleClass("open");
});

chrome.storage.sync.get(OPTIONS, items => {
  OPTIONS = items;

  setNickName()
    .then(() => {
      return setChildName();
    })
    .then(() => {
      init();
    })
    .catch(err => {
      alert(err);
    });
});

function setNickName() {
  return new Promise((resolve, reject) => {
    if ($("#roleSelect").text().trim() != "호칭 설정") return resolve();
    if (OPTIONS.nickname.use != 'on') return resolve();

    var roleSelect = $(`form[action='${ROLE_URL}']:first`);
    var url = `${BASE_URI}${ROLE_URL}`;
    var data = {
      csrfmiddlewaretoken: roleSelect.find("input[name='csrfmiddlewaretoken']").val(),
      nickname: OPTIONS.nickname.name,
      next: roleSelect.find("input[name='next']").val()
    }

    return $.ajax({
      type: "POST",
      url: url,
      data: data
    }).then(() => {
      return resolve();
    });
  });
}

function setChildName() {
  return new Promise((resolve, reject) => {
    if (OPTIONS.child.use != 'on') return resolve();
    var curSelectedChildName = $("img.header-img").attr("alt");
    if (curSelectedChildName == OPTIONS.child.name) return resolve();

    $("form[id^='activateForm-'][action^='/accounts/parents/children/activate/']").each((index, element) => {
      var childName = $(element).find("p[class='dropdown-display-name']").text().trim();
      if (childName == OPTIONS.child.name) {
        resolve();
        $(element).submit();
      }
    });
  });
}

function init() {
  moment.updateLocale('ko', {
    weekdays: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
    weekdaysShort: ["일", "월", "화", "수", "목", "금", "토"],
    meridiem: function (hour, minuate, isLowerCase) {
      if (hour < 12) {
        return "오전";
      } else {
        return "오후";
      }
    }
  });

  var regexpStr = /https:\/\/www\.kidsnote\.com\/(home|reports|albums)\/(\d+)*\/*/g;
  var matches = regexpStr.exec(document.URL);
  CUR_MENU = matches[1];

  if (CUR_MENU == 'home') return;
  if (matches[2] == undefined) {
    getPrevDate().then(termFrom => {
      return createTermAtAlbumPage(termFrom, moment().format("YYYY-MM-DD"));
    });
  } else {
    createButtonsInArticle();
  }
}

// #region 기간 다운로드
function createTermAtAlbumPage(from, to) {
  var dateDiv = $(`<div class="button-wrapper pull-left"></div>`).prependTo("div[class='sub-nav-inner']");
  var termFrom = $(`<input type="text" id="term_fr" name="term_fr" class="input-term form-control" readonly>`);
  termFrom.appendTo(dateDiv);
  var termTo = $(`<input type="text" id="term_to" name="term_to" class="input-term form-control" readonly>`);
  termTo.appendTo(dateDiv);
  var btnDownload = $('<button id="btnSave" type="button" class="btn btn-primary">다운로드</button>');
  btnDownload.appendTo(dateDiv).on("click", (e) => {
    downloadTerm($('#term_fr').val(), $('#term_to').val());
  });

  $('#term_fr').datetimepicker({
    format: 'YYYY-MM-DD',
    dayViewHeaderFormat: 'YYYY년 MM월',
    useCurrent: false,
    defaultDate: from,
    showTodayButton: true,
    ignoreReadonly: true
  });

  $('#term_to').datetimepicker({
    format: 'YYYY-MM-DD',
    dayViewHeaderFormat: 'YYYY년 MM월',
    useCurrent: false,
    defaultDate: to,
    showTodayButton: true,
    ignoreReadonly: true
  });
}

function downloadTerm(from, to) {
  if (!isValidTerm(from, to)) {
    alert("기간이 올바르지 않습니다");
    return;
  }
  var links_cnt = 0;

  showProgressBar();
  if (OPTIONS.term.use == 'on') setPrevDate(to);

  getLastPageIndex()
    .then(last_page_index => {
      setProgress(2, "페이지 링크를 수집하고 있습니다");

      var indexes = [];
      for (var i = last_page_index; i > 0; i--) indexes.push(i);

      return Promise.all(indexes.map(index => {
        return getArticleAddressesInPage(index);
      }));
    })
    .then(article_addresses_in_pages => {
      setProgress(5);
      if (article_addresses_in_pages.length == 1) return article_addresses_in_pages[0];
      return Promise.all(article_addresses_in_pages.reduce((a, b) => a.concat(b)));
    })
    .then(total_article_addresses => {
      setProgress(10, "게시물 링크를 수집하고 있습니다");

      return Promise.all(total_article_addresses.map(article_address => {
        return getArticles(article_address, from, to);
      }));
    })
    .then(articles => {
      setProgress(11);
      if (articles.length == 0) return Promise.reject("대상 게시물이 없습니다");

      return articles.filter((article) => {
        if (article.length > 0) return true;
        return false;
      });
    })
    .then(articles => {
      setProgress(12, "게시물 링크를 정리하고 있습니다");
      return Promise.all(articles.reduce((a, b) => a.concat(b)));
    })
    .then(links => {
      setProgress(13);

      links_cnt = links.length;
      return createTargets(links);
    })
    .then(targets => {
      var progress = {
        base: 20
      }
      progress.tick = (90 - progress.base) / links_cnt;
      setProgress(progress.base, "다운로드를 시작 합니다");
      var months = Object.getOwnPropertyNames(targets);

      return months.reduce((p, month) => {
        return p.then(() => {
          return createZip(targets[month], progress);
        });
      }, Promise.resolve()).then(() => {
        setProgress(100, "다운로드 완료");
      });
    })
    .catch(err => {
      alert(err);
    })
    .finally(() => {
      closeProgressBar();
    });
}

function createTargets(links) {
  return new Promise((resolve, reject) => {
    var targets = {};

    links.forEach((link) => {
      var ym = link.date.format("YYYYMM");

      if (!targets.hasOwnProperty(ym)) {
        targets[ym] = {
          zip: new JSZip(),
          links: []
        }
      }
      targets[ym].links.push(link);
    });
    return resolve(targets);
  });
}

function createZip(month, progress) {
  var ym = month.links[0].date.format("YYYY-MM");

  return Promise.all(month.links.map(link => {
      var prg_value = progress.base + progress.tick;
      progress.base = prg_value;

      return getBlobFromURL(link.url, 1)
        .then(data => {
          setProgress(prg_value, ym + " 다운로드 중...");
          var filename = link.filename + link.extension;

          if (month.zip.file(filename) != null) filename = link.filename + "_2" + link.extension;
          return month.zip.file(filename, data);
        });
    }))
    .then(() => {
      setProgress(-1, ym + " 압축파일 생성 중...");

      return month.zip.generateAsync({
          type: "blob"
        })
        .then(blob => {
          var filename = `${ym}-${CUR_MENU == "reports" ? "알림장" : "앨범"}.zip`;
          setProgress(-1, filename + " 다운로드 중...");
          return downloadFileFromBlob(blob, filename);
        });
    });
}

function getArticles(url, from, to) {
  return ajaxGet(url).then(source => {
    var links = [];
    var date_string = $(source).find(DATE_SELECTOR).text();
    var date, title;

    if (CUR_MENU == 'reports') {
      date = moment(date_string, REPORTS_DATE_FORMAT);
      title = "알림장";
    } else if (CUR_MENU == 'albums') {
      date = moment(date_string, ALBUMS_DATE_FORMAT);
      title = $(source).find("h3[class='sub-header-title']").text().trim();
    }

    if (date.isBetween(moment(from).add(-1, "days"), moment(to).add(1, "days"))) {
      $(source).find("div.grid a").each((index, element) => {
        var downloadUrl = $(element).attr("data-download");
        links.push({
          date: date,
          url: downloadUrl,
          filename: `${date.format("YYYY-MM-DD")}-${title}-${index}}`,
          extension: downloadUrl.slice(-4)
        });
      });
    }
    return links;
  });
}

function getArticleAddressesInPage(pageIndex) {
  return ajaxGet(`${BASE_URI}/${CUR_MENU}/?page=${pageIndex}`).then(source => {
    var selector = "";

    if (CUR_MENU == "reports") {
      selector = "div[class='report-list-wrapper'] a";
    } else if (CUR_MENU == "albums") {
      selector = "div[class='album-list-wrapper'] a";
    }

    return $(source).find(selector).map((index, element) => {
      return BASE_URI + $(element).attr("href");
    }).toArray();
  });
}

function getArticleDateString(url) {
  return ajaxGet(url).then(source => {
    var date_string = $(source).find(DATE_SELECTOR).text();

    if (CUR_MENU == 'reports') {
      return moment(date_string, REPORTS_DATE_FORMAT).format("YYYY-MM-DD");
    } else if (CUR_MENU == 'albums') {
      return moment(date_string, ALBUMS_DATE_FORMAT).format("YYYY-MM-DD");
    }
  });
}

function getFirstArticlesDateString() {
  return getLastPageIndex().then(last_page_index => {
    var url = `${BASE_URI}/${CUR_MENU}/?page=${last_page_index}`;

    return ajaxGet(url).then(source => {
      var selector = "";

      if (CUR_MENU == 'reports') {
        selector = ".report-list-wrapper a:last";
      } else if (CUR_MENU == 'albums') {
        selector = ".album-list-wrapper a:last";
      }
      return getArticleDateString(BASE_URI + $(source).find(selector).attr("href"));
    });
  });
}

function getLastPageIndex() {
  return new Promise((resolve, reject) => {
    var last_page_index = 1;
    var paging = $("ul[class='pagination pagination-sm'] li");

    if (paging.length > 0) {
      last_page_index = $(paging[paging.length - 1]).text().trim();
      if (last_page_index == ">") last_page_index = $(paging[paging.length - 2]).text().trim();
    }

    resolve(last_page_index);
  });
}
// #endregion 기간 다운로드

// #region 게시물 내 다운로드
function createButtonsInArticle() {
  $("div[class='grid']").each((index, element) => {
    var a = $(element).find("a");
    var img = $(element).find("img");
    var selectButton = "<img class='btnSelect' " +
      "src='" + (CUR_MENU == "reports" ? IMG_CHECKED : IMG_UNCHECKED) + "' " +
      "value='" + (CUR_MENU == "reports" ? "true" : "false") + "'>";

    img.detach();
    img.appendTo($(element));
    $(element).attr("previewSrc", a.attr("href"));
    $(element).attr("downloadSrc", a.attr("data-download"));

    var format, title;
    if (CUR_MENU == "reports") {
      format = REPORTS_DATE_FORMAT;
      title = "알림장";
    } else if (CUR_MENU = "albums") {
      format = ALBUMS_DATE_FORMAT;
      title = img.attr("alt");
    }

    var date_string = moment($(DATE_SELECTOR).text().trim(), format).format("YYYY-MM-DD");
    var index = $(element).attr("data-index");
    var extension = a.attr("href").slice(-4);

    $(element).attr("fileName", `${date_string}-${title}-${index}${extension}`);

    img.removeAttr("alt");
    a.remove();
    $(selectButton).appendTo($(element));

    bindEventOnButtonSelect($(element), null);
    bindEventOnPreview($(element));
  });

  var selectAllButton = $("<div><img id='btnSelectAll' src='" + IMG_UNCHECKED + "' value='false'><span>모두 선택</span></div>");
  selectAllButton.prependTo("div[class='image-section'][id!='img-grid-container']");
  bindEventOnButtonSelect(selectAllButton.find("img[id='btnSelectAll']"), $("img[class='btnSelect']"));

  var downloadButton = "<a href='#' class='btn btn-default' id='btnDownloadSelected'><i class='kn kn-list'></i> 선택 다운</a>";
  switch (CUR_MENU) {
    case "reports":
      $(downloadButton).appendTo($("div[class='button-group-wrapper']").find("div[class='pull-right']"));
      break;

    case "albums":
      $(downloadButton).appendTo($("div[class='bottom-buttons text-right']"));
      break;
  }
  bindEventOnClickDownloadSelected();
}

function bindEventOnButtonSelect(target, childs) {
  target.unbind("click").click(e => {
    var button;

    if (target.is("div")) {
      button = $(target).find("img[class='btnSelect']");
    } else {
      button = target;
    }

    if (button.attr("value") == "true") {
      button.attr("src", IMG_UNCHECKED);
      button.attr("value", "false");

      if (childs != undefined) {
        childs.attr("src", IMG_UNCHECKED);
        childs.attr("value", "false");
      }
    } else {
      button.attr("src", IMG_CHECKED);
      button.attr("value", "true");

      if (childs != undefined) {
        childs.attr("src", IMG_CHECKED);
        childs.attr("value", "true");
      }
    }

    if (CUR_MENU == "albums" && childs == undefined) {
      var btnSelectAll = $("img[id='btnSelectAll']");
      var selectedCnt = $("img[class='btnSelect'][value='true']").length;
      var deSelectedCnt = $("img[class='btnSelect'][value='false']").length;
      var totalCnt = $("img[class='btnSelect']").length;

      if (deSelectedCnt > 0 && btnSelectAll.attr("value") == "true") {
        btnSelectAll.attr("src", IMG_UNCHECKED);
        btnSelectAll.attr("value", "false");
      }

      if (totalCnt == selectedCnt) {
        btnSelectAll.attr("src", IMG_CHECKED);
        btnSelectAll.attr("value", "true");
      }
    }
  });
}

function bindEventOnPreview(target) {
  target.mouseenter(mouseEvent => {
    $(window).unbind("keydown").keydown(keyEvent => {
      if (keyEvent.ctrlKey || keyEvent.keyCode == 86) {
        var previewer = $("img[class='previewer']");
        var previewSrc = target.attr("previewSrc");

        if (previewer.length == 0) {
          previewer = $("<img class='previewer' src='" + previewSrc + "'>").appendTo("body");

          previewer.bind("load", e => {
            var winW = $(window).width();
            var winH = $(window).height();
            var imgW = e.target.width;
            var imgH = e.target.height;
            var aspectRatio = imgW / imgH;

            if (imgW > winW) {
              imgW = winW - 20;
              imgH = imgW * aspectRatio;
            }

            if (imgH > winH) {
              imgH = winH - 20;
              imgW = imgH * aspectRatio;
            }

            var x = CUR_POS.x;
            var y = CUR_POS.y;
            var r = x - $(window).scrollLeft() + imgW;
            var b = y - $(window).scrollTop() + imgH;
            var newL = r > winW ? (x + winW - r - 10) : x;
            var newT = b > winH ? (y + winH - b - 10) : y;

            previewer.css({
              position: "absolute",
              left: newL,
              top: newT,
              width: imgW,
              height: imgH
            });
          });

          previewer.click(e => {
            $(previewer).remove();
          });
        } else {
          if (previewer.attr("src") != previewSrc) previewer.attr("src", previewSrc);
        }
      }
    });
  }).mouseleave(e => {
    $(window).unbind("keydown");
  })
}

function bindEventOnClickDownloadSelected() {
  var button = $("a[id='btnDownloadSelected']");

  button.unbind("click").click(e => {
    e.preventDefault();
    showProgressBar();
    downloadFiles(0, $("div[class='grid']").has("img[class='btnSelect'][value='true']"));
  });
}

function downloadFiles(index, file) {
  setProgress((100 / file.length) * (index + 1));

  if (index == file.length) {
    closeProgressBar();
    return;
  }

  var url = $(file[index]).attr("downloadsrc");
  var fileName = $(file[index]).attr("filename");

  getBlobFromURL(url).then(data => {
    return downloadFileFromBlob(data, fileName);
  }).then(() => {
    setTimeout(() => {
      downloadFiles(++index, file);
    }, OPTIONS.down_delay);
  }).catch(e => {
    console.log(e);
  });
}
// #endregion 게시물 내 다운로드

// #region 공통
function ajaxGet(url) {
  return new Promise((resolve, reject) => $.get(url).done(resolve).fail((a, b, c) => reject(c || a || b)));
}

function getPrevDate() {
  return new Promise((resolve, reject) => {
    var childName = $("img.header-img").attr("alt");
    var foundIndex = -1;

    for (var i = 0; i < OPTIONS.term.prev_date.length; i++) {
      if (OPTIONS.term.prev_date[i].name == childName && OPTIONS.term.prev_date[i].menu == CUR_MENU) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex > -1) {
      resolve(OPTIONS.term.prev_date[foundIndex].date);
    } else {
      resolve(getFirstArticlesDateString());
    }
  });
}

function setPrevDate(date) {
  var childName = $("img.header-img").attr("alt");
  var today = moment().format("YYYY-MM-DD");
  var fromDate = moment(date).add(1, "days").format("YYYY-MM-DD");
  if (moment(fromDate).diff(moment(today), 'days') > 0) fromDate = today;

  var prev_date = {
    name: childName,
    menu: CUR_MENU,
    date: fromDate
  }
  var foundIndex = -1;

  for (var i = 0; i < OPTIONS.term.prev_date.length; i++) {
    if (OPTIONS.term.prev_date[i].name == childName && OPTIONS.term.prev_date[i].menu == CUR_MENU) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex > -1) {
    OPTIONS.term.prev_date[foundIndex] = prev_date;
  } else {
    OPTIONS.term.prev_date.push(prev_date);
  }
  chrome.storage.sync.set(OPTIONS, function () {});
}

function isValidTerm(from, to) {
  var fromDate = moment(from, "YYYY-MM-DD");
  var toDate = moment(to, "YYYY-MM-DD");

  return toDate.diff(fromDate, 'days') >= 0;
}

function getBlobFromURL(url, retry_cnt) {
  return new Promise((resolve, reject) => {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onreadystatechange = event => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200 || xhr.status === 0) {
            resolve(xhr.response || xhr.responseText);
          } else {
            reject(xhr.statusText);
          }
        }
      };
      xhr.send();
    } catch (e) {
      if (retry_cnt > 3) {
        console.log("시도횟수 초과: " + url);
        return reject(e);
      }
      console.log("재시도 (" + ++retry_cnt + "): " + url);
      return getBlobFromURL(url, retry_cnt);
    }
  });
}

function downloadFileFromBlob(blob, fileName) {
  var a = document.createElement('a');
  document.body.appendChild(a);

  var url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  a.click();

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, OPTIONS.down_delay);
}
// #endregion 공통

// #region 상태 진행 바 팝업
function showProgressBar() {
  if (PROGRESS_MODAL == undefined) {
    var modal = '<div class="modal fade" id="pleaseWaitDialog" tabindex="-1" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true" data-backdrop="static" data-keyboard="false">';
    modal += '<div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h2>다운로드 중 입니다</h2></div>';
    modal += '<div class="modal-body"><div class="progress">';
    modal += '<div id="progress-bar" class="progress-bar progress-bar-success progress-bar-striped active" role="progressbar">';
    modal += '<span class="sr-only">0%</span></div></div></div></div></div></div>';

    PROGRESS_MODAL = $(modal);
    PROGRESS_MODAL.appendTo("body");
  }
  PROGRESS_MODAL.modal('show');
}

function setProgress(progress, message) {
  if (PROGRESS_MODAL != undefined) {
    if (message != undefined) $("div.modal-header h2").text(message);
    if (progress != -1) {
      var cur_progress = getProgress();
      if (cur_progress < progress) $("#progress-bar").css("width", `${progress}%`);
    }
  } else {
    console.log(progress + " : " + message);
  }
}

function getProgress() {
  var cur = $("#progress-bar").width();
  if (cur == 0) cur = 1;
  var cur2 = $("#progress-bar").parent().width();
  return 100 * cur / cur2;
}

function closeProgressBar() {
  if (PROGRESS_MODAL != undefined) {
    PROGRESS_MODAL.modal('hide');
  }
}
// #endregion 상태 진행 바 팝업