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
var CUR_MENU;

var regexpStr = /chrome-extension:\/\/(\w+)\/options\.html(\?page=(\w+))*/g;
var matches = regexpStr.exec(document.URL);

if (matches[3] == undefined) {
  CUR_MENU = "settings";
} else {
  CUR_MENU = matches[3];
}

$(document).ready(() => {
  $("#version").text(chrome.app.getDetails().version);
});

function Init() {
  $("a.sideitem").removeClass("active");
  $(`a.sideitem#${CUR_MENU}`).addClass("active");
  $("div.page").removeClass("active");
  $(`div.page#${CUR_MENU}`).addClass("active");

  if (CUR_MENU == "settings") {
    chrome.storage.sync.get(OPTIONS, function (items) {
      OPTIONS = items;
      updateUI();

      $('.onoff').change(function () {
        var isChecked = $(this).prop('checked');
        var targetId = $(this).attr('target');
        if (targetId != undefined) $(`#${targetId}`).prop('disabled', !isChecked);
      });

      $('#btnSave').click(function () {
        setOPTIONS();
      });
    });
  } else if (CUR_MENU == "about") {

  }
}

function updateUI() {
  $('#useNickname').bootstrapToggle(OPTIONS.nickname.use);
  $('#nickname').val(OPTIONS.nickname.name);
  $('#nickname').prop('disabled', OPTIONS.nickname.use == 'on' ? false : true);

  $('#useChild').bootstrapToggle(OPTIONS.child.use);
  $('#child').val(OPTIONS.child.name);
  $('#child').prop('disabled', OPTIONS.child.use == 'on' ? false : true);

  $('#useTerm').bootstrapToggle(OPTIONS.term.use);

  $('#downDelay').val(OPTIONS.down_delay);
}

function setOPTIONS() {
  OPTIONS.nickname.use = $('#useNickname').prop('checked') ? 'on' : 'off';
  OPTIONS.nickname.name = $('#nickname').val();
  OPTIONS.child.use = $('#useChild').prop('checked') ? 'on' : 'off';
  OPTIONS.child.name = $('#child').val();
  OPTIONS.term.use = $('#useTerm').prop('checked') ? 'on' : 'off';
  OPTIONS.down_delay = $('#downDelay').val();

  chrome.storage.sync.set(OPTIONS, function () {
    alert('저장되었습니다');
  });
}

Init();