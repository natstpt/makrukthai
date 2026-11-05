/* Fills a box with the site's credits from credits.html (its #credits), fetched once per page. Used by the home page's
 * credits dialog and the lessons page's credits window, so the credits are written in one place. Relative links in
 * credits.html are from the site root; both pages resolve them from there (the lessons page has <base href="../">). */
(function (root) {
  'use strict';
  var got = null;
  function fetchCredits() {
    if (!got) got = fetch('credits.html?v=20261111-credits').then(function (res) {
      if (!res.ok) throw Error(res.status);
      return res.text();
    }).then(function (text) {
      var main = new DOMParser().parseFromString(text, 'text/html').getElementById('credits');
      if (!main) throw Error('no #credits');
      return main.innerHTML;
    }).catch(function (e) { got = null; throw e; });
    return got;
  }
  function load(box) {
    if (!box || box.dataset.loaded === '1') return Promise.resolve();
    return fetchCredits().then(function (html) {
      box.innerHTML = html; box.dataset.loaded = '1';
    }, function () {
      box.innerHTML = '<p class="infoIntro">โหลดเครดิตไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองเปิดอีกครั้ง หรือ <a href="credits.html">เปิดหน้าเครดิต</a></p>';
    });
  }
  root.MakrukCredits = { load: load };
})(window);
