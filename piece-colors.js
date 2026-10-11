/* Piece colours: white–red (ขาว–แดง, the default) or white–black (ขาว–ดำ), chosen in the settings dialog.
 * With white–black, the red pieces use the black SVG set and every "แดง" on the page reads "ดำ"
 * (text, titles and labels), so lessons and feedback match the board. Changing the choice reloads the page. */
(function (root) {
  'use strict';
  var KEY = 'makrukPieceColors', mode = 'red';
  try { if (root.localStorage.getItem(KEY) === 'black') mode = 'black'; } catch (e) {}
  var doc = root.document;
  doc.documentElement.classList.toggle('blackPieces', mode === 'black');

  // Image prefix for a side: w (white), r (red) or b (black).
  function prefix(side) { return side === 'white' ? 'w' : mode === 'black' ? 'b' : 'r'; }
  function choose(next) {
    if (next === mode) return;
    try { root.localStorage.setItem(KEY, next); } catch (e) {}
    root.location.reload();
  }

  if (mode === 'black') {
    var ATTRS = ['title', 'aria-label', 'alt', 'placeholder'];
    var keep = function (node) { var el = node.nodeType === 1 ? node : node.parentElement; return !!(el && el.closest('[data-keep-colors],script,style,textarea')); };
    var fixText = function (node) { if (node.nodeValue.indexOf('แดง') >= 0 && !keep(node)) node.nodeValue = node.nodeValue.replace(/แดง/g, 'ดำ'); };
    var fixElement = function (el) {
      if (keep(el)) return;
      ATTRS.forEach(function (name) { var v = el.getAttribute(name); if (v && v.indexOf('แดง') >= 0) el.setAttribute(name, v.replace(/แดง/g, 'ดำ')); });
      if (el.tagName === 'IMG') { var src = el.getAttribute('src'); if (src && /\/ada\/r[A-Z]\.svg/.test(src)) el.setAttribute('src', src.replace(/\/ada\/r([A-Z]\.svg)/, '/ada/b$1')); }
    };
    var fixTree = function (node) {
      if (node.nodeType === 3) { fixText(node); return; }
      if (node.nodeType !== 1) return;
      fixElement(node);
      var walker = doc.createTreeWalker(node, 5); // elements and text
      for (var n = walker.nextNode(); n; n = walker.nextNode()) { if (n.nodeType === 3) fixText(n); else fixElement(n); }
    };
    var start = function () {
      if (doc.title.indexOf('แดง') >= 0) doc.title = doc.title.replace(/แดง/g, 'ดำ');
      fixTree(doc.body);
      new MutationObserver(function (records) {
        records.forEach(function (r) {
          if (r.type === 'characterData') fixText(r.target);
          else if (r.type === 'attributes') fixElement(r.target);
          else r.addedNodes.forEach(fixTree);
        });
      }).observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['src']) });
    };
    if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
  }

  root.MakrukPieceColors = { mode: function () { return mode; }, prefix: prefix, choose: choose };
})(window);
