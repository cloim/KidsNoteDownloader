chrome.runtime.onInstalled.addListener(function () {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
    var rules = {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            urlMatches: 'https:\/\/www\.kidsnote\.com\/(home|reports|albums)\/[0-9]*'
          }
        })
      ],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }
    chrome.declarativeContent.onPageChanged.addRules([rules]);
  });

  chrome.storage.local.get('version', function (result) {
    if (result.version == undefined || result.version != chrome.app.getDetails().version) {
      chrome.tabs.create({
        url: chrome.extension.getURL("options.html?page=about")
      }, function (tab) {});

      chrome.storage.local.set({
        'version': chrome.app.getDetails().version
      });
    }
  });
});