/* Play-the-computer chapter (lessons before เล่นจริง): one lesson per AI level. The lesson page skips the teaching
   steps and opens the game at once; the learner plays one whole game on the AI page (editor.html?play=ai&level=…&lesson=…).
   The AI page records finished games in localStorage (makrukAiGames); a lesson passes after one finished game at its
   level, whether it was won, lost or drawn. */
(function(root){
  'use strict';
  var KIND={K:'king',Q:'met',B:'khon',N:'knight',R:'rook',F:'promoted',P:'pawn'};
  function at(sq){return {r:8-Number(sq.charAt(1)),c:'abcdefgh'.indexOf(sq.charAt(0))};}
  function board(text){
    return text.split(' ').filter(Boolean).map(function(token){
      var parts=token.split(':'),red=parts[0]!==parts[0].toUpperCase();
      return {piece:KIND[parts[0].toUpperCase()],side:red?'black':'white',at:at(parts[1])};
    });
  }
  function step(text,position,marks){return {text:text,pieces:board(position),marks:(marks||[]).map(at)};}
  var START='R:a1 N:b1 B:c1 K:d1 Q:e1 B:f1 N:g1 R:h1 P:a3 P:b3 P:c3 P:d3 P:e3 P:f3 P:g3 P:h3 '+
    'r:a8 n:b8 b:c8 q:d8 k:e8 b:f8 n:g8 r:h8 p:a6 p:b6 p:c6 p:d6 p:e6 p:f6 p:g6 p:h6';
  var SHAPE='R:a1 K:d1 R:h1 N:d2 N:e2 B:f2 P:a3 P:b3 P:c3 B:d3 Q:e3 P:f3 P:g3 P:h3 P:d4 P:e4 '+
    'r:a8 k:e8 r:h8 b:c7 n:d7 n:e7 p:a6 p:b6 p:c6 q:d6 b:e6 p:f6 p:g6 p:h6 p:d5 p:e5';
  var NAMES={easy:'ง่าย',medium:'กลาง',hard:'ยาก'};
  function lesson(id,level,heading,speech,description,rule,steps,hint){
    return {id:id,title:'เล่นกับ AI ('+NAMES[level]+')',day:2,type:'aiGame',aiLevel:level,fullSetup:true,
      heading:heading,speech:speech,description:description,rule:rule,
      teachingSteps:steps.map(function(s){return s.text;}),teachingBoards:steps,
      mission:'เล่นกับ AI ระดับ'+NAMES[level]+'ให้จบ 1 เกม',caption:'เล่นกับ AI ระดับ'+NAMES[level],hint:hint,
      requiredCorrect:1,mainText:'เริ่มฝึก'};
  }
  root.buildAiLessons=function(){
    return [
      lesson('ai-easy','easy','เล่นกับ AI ระดับง่าย',
        'AI ระดับ<strong>ง่าย</strong>เปิดหมากเป็นทรง แล้วคิดล่วงหน้าแค่ 1 ชั้น ลองวางแผนหลายตาให้ AI ตามไม่ทัน',
        'เหมาะกับการลองใช้ทุกอย่างที่เรียนมาในเกมจริงครั้งแรก',
        'คิดก่อนเดิน · หาหมากกินฟรี · ใช้กลยุทธ์ที่เรียนมา',[
        step('คุณเล่นฝ่ายขาว เดินก่อน AI เล่นฝ่ายแดง เริ่มจากยึดกลางกระดานด้วยเบี้ย ง4 จ4 แล้วพาหมากออกมา',START,['d3','e3','d4','e4']),
        step('ก่อนเดินทุกตา ถามตัวเอง 3 ข้อ: แดงขู่กินอะไร? หมากเราปลอดภัยไหม? มีหมากแดงให้กินฟรีไหม?',SHAPE,['d5','e5','d4','e4']),
        step('AI ระดับง่ายเดินพลาดได้ ถ้าเห็นหมากแดงไม่มีตัวคุ้มกัน กินได้เลย แล้วใช้คร่อม กดหน้าขุน หรือเสียบที่เรียนมา',SHAPE,['d7','e7','c7','e6']),
        step('กดเริ่มเล่นแล้วเล่นให้จบ 1 เกม ชนะ แพ้ หรือเสมอก็ผ่านบทได้ เล่นจบแล้วกด “← บทเรียน” เพื่อกลับมา',START,[])
      ],'ก่อนเดินดูว่ามีหมากแดงตัวไหนไม่มีตัวคุ้มกันบ้าง แล้วระวังหมากของเราด้วย'),
      lesson('ai-medium','medium','เล่นกับ AI ระดับกลาง',
        'AI ระดับ<strong>กลาง</strong>คิดล่วงหน้า 5 ชั้น ไม่ยอมเสียหมากง่าย ๆ และกินหมากที่เราปล่อยไว้ทันที',
        'ต้องระวังหมากของเราทุกตา และวางแผนให้หมากช่วยกันคุ้มกัน',
        'ผูกหมากให้คุ้มกันกัน · อย่าปล่อยหมากลอย · มองหาโอกาสคร่อม',[
        step('AI ระดับกลางเปิดหมากเป็นทรงเหมือนกัน ฝ่ายแดงจะยืน ง5 จ5 เม็ด ง6 พร้อมคุ้มกันกัน',SHAPE,['d5','e5','d6','c7','e6']),
        step('ทุกหมากที่เดินออกไป ควรมีตัวคุ้มกันอยู่ ถ้าแดงกิน เราจะกินคืนได้ (การผูกหมาก)',SHAPE,['d2','e2','d3','e3','f2']),
        step('ปลายเกมเมื่อเบี้ยคว่ำหมด ฝ่ายที่หมากน้อยกว่าขอนับศักดิ์กระดานได้ ถ้าเราเหลือหมากน้อยกว่า ลองกดขอนับ','K:d1 R:a1 k:e8 r:h8 n:g8',['d1','e8']),
        step('กดเริ่มเล่นแล้วเล่นให้จบ 1 เกม ชนะ แพ้ หรือเสมอก็ผ่านบทได้ เล่นจบแล้วกด “← บทเรียน” เพื่อกลับมา',START,[])
      ],'อย่าปล่อยหมากไว้ช่องที่แดงกินได้ฟรี ให้มีหมากของเราคุ้มกันอยู่เสมอ'),
      lesson('ai-hard','hard','เล่นกับ AI ระดับยาก',
        'AI ระดับ<strong>ยาก</strong>ใช้เครื่องยนต์ Fairy-Stockfish คิดตาละไม่เกิน 1 วินาที เก่งมาก แพ้ได้เป็นเรื่องปกติ',
        'เป้าหมายคือเล่นให้นานที่สุด ไม่เสียหมากฟรี และเรียนรู้ว่าแพ้เพราะตาไหน',
        'เล่นช้า ๆ คิดทุกตา · ใช้ย้อนกลับดูตาที่พลาด · ขอนับเมื่อเหลือหมากน้อยกว่า',[
        step('AI ระดับยากเปิดหมากเป็นทรง แล้วเครื่องยนต์จะเล่นต่อ บนมือถือใช้แบบ Lite ที่โหลดเร็วและใช้ทรัพยากรน้อย',SHAPE,['d4','e4','d5','e5']),
        step('AI จะหาตาคร่อม กดหน้าขุน และเสียบได้เก่ง อย่าวางหมากสองตัวไว้ในแนวเดียวกันหรือในช่องที่ม้าแดงกระโดดถึงทั้งคู่','K:a1 N:d4 k:c7 r:g7',['e6','c7','g7']),
        step('ถ้าเดินพลาด กด “ย้อนกลับ” ดูตาที่พลาดได้ และถ้าเหลือหมากน้อยกว่าในปลายเกม ขอนับศักดิ์เพื่อหาทางเสมอ','K:d1 R:a1 k:e8 r:h8 n:g8',['d1','e8']),
        step('กดเริ่มเล่นแล้วเล่นให้จบ 1 เกม ชนะ แพ้ หรือเสมอก็ผ่านบทได้ เล่นจบแล้วกด “← บทเรียน” เพื่อกลับมา',START,[])
      ],'คิดให้ครบทุกตา ระวังตาที่แดงขู่สองตัวพร้อมกัน และใช้ย้อนกลับเพื่อเรียนรู้')
    ];
  };
})(typeof window==='object'?window:globalThis);
