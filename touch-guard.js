/* Keep the page still on phones and tablets: no pinch zoom, no double-tap zoom, no page dragging.
   iOS Safari ignores "user-scalable=no" in the viewport tag, so zoom is blocked here as well. */
(function(doc){
  'use strict';
  if(!doc||!doc.addEventListener)return;
  // Pinch zoom (Safari gesture events, and two-finger moves elsewhere).
  ['gesturestart','gesturechange','gestureend'].forEach(function(type){doc.addEventListener(type,function(e){e.preventDefault();},{passive:false});});
  doc.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault();},{passive:false});
  // Double-tap zoom on empty space. Taps on controls and the board are left alone so quick moves still register.
  var CONTROLS='button,a,input,select,textarea,label,summary,details,[role="button"],.square,.boardWrap,.piece';
  var lastTap=0;
  doc.addEventListener('touchend',function(e){
    var now=Date.now(),quick=now-lastTap<350;lastTap=now;
    if(quick&&e.cancelable&&!(e.target&&e.target.closest&&e.target.closest(CONTROLS)))e.preventDefault();
  },{passive:false});
  doc.addEventListener('dblclick',function(e){if(!(e.target&&e.target.closest&&e.target.closest('input,textarea')))e.preventDefault();},{passive:false});
})(typeof document==='object'?document:null);
