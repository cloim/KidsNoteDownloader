$(document).ready(() => {
    $("#extVer").text(chrome.app.getDetails().version);
});