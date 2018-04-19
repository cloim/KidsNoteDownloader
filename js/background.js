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

  chrome.tabs.create({ url: chrome.extension.getURL("options.html?page=about") }, function (tab) {});
});