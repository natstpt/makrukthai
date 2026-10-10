/* Endgame chapter: how to drive the red king to the edge and mate it (ไล่ปลายกระดาน).
   Positions come from the mating-pattern diagrams in "ตำรากลหมากรุกไทย" by นายแพทย์ประกอบ บุญไทย
   (each "เตรียมการ" and "ตาจน" pair). Every "ตาจน" is checked by tests/endgame-lessons.test.cjs, and each
   practice task is the position one move before mate, where the star move is the only mate.
   Board strings: K king, R rook, B khon, N knight, M promoted pawn, P pawn (white); k red king. */
(function(root){
  'use strict';
  var KIND={K:'king',R:'rook',B:'khon',N:'knight',M:'promoted',P:'pawn',k:'king'};
  function at(sq){return {r:8-Number(sq.charAt(1)),c:'abcdefgh'.indexOf(sq.charAt(0))};}
  function board(text){
    return text.split(' ').map(function(token){
      var parts=token.split(':');
      return {piece:KIND[parts[0]],side:parts[0]==='k'?'black':'white',at:at(parts[1])};
    });
  }
  // One practice task: the position before mate, the moving piece's square and the mating square.
  function mateTask(title,pre,from,to,mission,success){
    var pieces=board(pre),start=at(from),mover=null;
    pieces=pieces.filter(function(p){
      if(!mover&&p.side==='white'&&p.at.r===start.r&&p.at.c===start.c){mover=p;return false;}
      return true;
    });
    return {piece:mover.piece,start:start,goals:[at(to)],mission:title+' · '+mission,
      friends:pieces.filter(function(p){return p.side==='white';}),
      enemies:pieces.filter(function(p){return p.side==='black';}),
      hint:'เดิน'+'ไปช่องดาวเพื่อรุกจน',success:success};
  }
  function step(text,position,marks){return {text:text,pieces:board(position),marks:(marks||[]).map(at)};}
  // Rule references in the 2569 rules PDF, shown under "กติกาสำคัญที่ใช้ในบทนี้".
  var MATE_NOTE={text:'รุกจนคือขุนถูกรุกและแก้ไม่ได้ ถ้าไล่จนขุนแดงไม่ถูกรุกแต่ไม่มีตาเดิน จะเป็นอับ คือเสมอ ไม่ใช่ชนะ',page:9,clause:'ก 4.1, ก 4.3'};
  function countNote(text){return {text:'ไล่ปลายกระดานต้องรุกจนให้ได้ภายในจำนวนตาที่นับ (ศักดิ์หมาก): '+text+' ถ้าไม่แน่ใจให้กรรมการช่วยนับ',page:10,clause:'ก 5.3'};}
  function lesson(id,title,heading,speech,description,rule,steps,tasks,count){
    return {id:id,title:title,day:2,type:'challenge',endgame:true,piece:tasks[0].piece,sourceNotes:[MATE_NOTE,countNote(count)],
      heading:heading,speech:speech,description:description,rule:rule,
      teachingSteps:steps.map(function(s){return s.text;}),teachingBoards:steps,
      challenges:tasks,mission:tasks[0].mission,caption:title,
      hint:'ดูว่าขุนแดงหนีไปช่องไหนได้บ้าง แล้วเดินไปช่องดาวเพื่อปิดทางสุดท้าย',
      requiredCorrect:tasks.length,mainText:'เริ่มฝึก'};
  }

  root.buildEndgameLessons=function(){
    return [
      lesson('endgame-rook-khon','ไล่ด้วยเรือและโคน','ต้อนขุนเข้าขอบกระดาน',
        'ปลายเกมต้อง<strong>ต้อนขุนแดงเข้าขอบ</strong> แล้วปิดทางหนีให้หมด',
        'ขุนขาวช่วยคุมช่องหนี หมากอีกตัวเป็นตัวรุก',
        'ต้อนเข้าขอบ → ขุนขาวคุม → รุกจน',[
        step('เตรียมการ เรือเดี่ยว · ขุนขาว จ6 ยืนตรงหน้าขุนแดง จ8 ขุนแดงจึงติดขอบกระดาน','k:e8 R:b6 K:e6',['e6','e8']),
        step('ตาจน · เรือลงไป ข8 รุกทั้งแถว 8 ขุนขาวคุม ง7 จ7 ฉ7 ขุนแดงหนีไม่ได้','k:e8 R:b8 K:e6',['b8','d7','e7','f7']),
        step('เตรียมการ เรือคู่ · เรือลำหนึ่งกั้นแถว อีกลำร่นเข้ามาทีละแถว ให้ขุนแดงมีที่เดินแคบลง','k:d5 R:b6 R:g7 K:e3',['b6','g7']),
        step('ตาจน · เรือ ข6 กั้นแถว 6 เรือ ค5 รุกแถว 5 ขุนขาว จ3 คุมแถว 4','k:e5 R:b6 R:c5 K:e3',['b6','c5','d4','e4','f4']),
        step('เตรียมการ โคนเดี่ยว · ขุนขาว ช6 ยืนหน้าขุนแดง แล้วขยับโคนเข้ามาใกล้','k:h8 B:e7 K:g6',['g6','h8']),
        step('ตาจน · โคน ช7 รุกตรงหน้า คุม ฉ8 กับ ญ8 ขุนขาวคุมโคนและช่อง ฉ7 ญ7','k:g8 B:g7 K:g6',['g7','f8','h8'])
      ],[
        mateTask('เรือเดี่ยว','k:e8 R:b6 K:e6','b6','b8','เดินเรือ ข6 ขึ้นไปรุกจน','รุกจน! เรือคุมแถวของขุนแดงทั้งแถว และขุนขาวคุมแถวข้างหน้า'),
        mateTask('เรือคู่','k:e5 R:b6 R:c7 K:e3','c7','c5','เดินเรือ ค7 ลงมารุกจน','รุกจน! เรือสองลำกั้นสองแถวติดกัน และขุนขาวคุมแถวที่เหลือ'),
        mateTask('โคนเดี่ยว','k:g8 B:f6 K:g6','f6','g7','เดินโคน ฉ6 ขึ้นไปรุกจน','รุกจน! โคนรุกตรงหน้า และขุนขาวคุมโคนไว้')
      ],'เรือ 2 ลำ 8 ตา · เรือ 1 ลำ 16 ตา · โคน 2 ตัว 22 ตา · โคน 1 ตัว 44 ตา'),
      lesson('endgame-khon-promoted','โคนกับเบี้ยหงาย','โคนกับเบี้ยหงายช่วยกัน',
        'โคนกับเบี้ยหงาย<strong>ช่วยกันปิดช่อง</strong> โดยมีขุนขาวคอยคุม',
        'หลังโคน: ขุนแดงอยู่หลังโคน · หน้าโคน: ขุนแดงอยู่หน้าโคน',
        'ขุนขาวคุมตัวรุก · อีกตัวปิดช่องที่เหลือ',[
        step('เตรียมการ หลังโคน · ขยับโคนกับเบี้ยหงายเข้าใกล้ขุนแดงที่มุม โดยมีขุนขาวคุม','k:g8 B:e6 M:f6 K:h5',['g8','e6','f6']),
        step('ตาจน · โคน ฉ7 รุก เบี้ยหงาย ช7 ปิด ญ8 ขุนขาว ช6 คุมทั้งสองตัว','k:g8 B:f7 M:g7 K:g6',['f7','g7','f8','h8']),
        step('เตรียมการ หน้าโคน · ขุนแดงอยู่หน้าโคน ขุนขาวยืนข้างโคนคอยคุม','k:b8 B:b6 K:c6 M:c5',['b8','b6','c5']),
        step('ตาจน · เบี้ยหงาย ข6 รุก ก7 โคน ข7 ปิด ก8 กับ ก6 ขุนขาว ค6 คุมโคน','k:a7 B:b7 M:b6 K:c6',['b6','b7','a8','a6'])
      ],[
        mateTask('หลังโคน แบบที่ 4','k:g8 B:e6 M:g7 K:g6','e6','f7','เดินโคน จ6 ไปรุกจน','รุกจน! โคนรุก เบี้ยหงายปิด ญ8 และขุนขาวคุมทั้งสองตัว'),
        mateTask('หลังโคน แบบที่ 3','k:g8 B:f6 K:g6 M:g5','f6','g7','เดินโคน ฉ6 ขึ้นไปรุกจน','รุกจน! โคนรุกตรงหน้า และขุนขาวคุมโคนกับช่องข้าง'),
        mateTask('หลังโคน แบบที่ 2','k:h8 M:e7 B:g8 K:h6','g8','h7','เดินโคน ช8 ไปรุกจน','รุกจน! โคนรุกตรงหน้า และขุนขาวคุมโคนไว้'),
        mateTask('หลังโคน ที่มุมล่าง','k:h3 B:g3 M:f1 K:f2','f1','g2','เดินเบี้ยหงาย ฉ1 ไปรุกจน','รุกจน! เบี้ยหงายรุก โคนปิดทางหนี และขุนขาวคุมทั้งสองตัว'),
        mateTask('หน้าโคน แบบที่ 1','k:a7 B:b7 M:c5 K:c6','c5','b6','เดินเบี้ยหงาย ค5 ไปรุกจน','รุกจน! เบี้ยหงายรุก โคนปิด ก8 กับ ก6'),
        mateTask('หน้าโคน แบบที่ 2','k:b8 B:c6 K:b6 M:e7','c6','b7','เดินโคน ค6 ขึ้นไปรุกจน','รุกจน! โคนรุกตรงหน้า และขุนขาว ข6 คุมโคนกับช่องข้าง')
      ],'ใช้เพดานของตัวที่นับน้อยที่สุด เช่น โคน 1 ตัวกับเบี้ยหงาย นับ 44 ตา'),
      lesson('endgame-knight','ม้ากับเบี้ยหงาย','ม้ากับเบี้ยหงายไล่เข้ามุม',
        'ม้า<strong>รุกจากระยะตัว L</strong> เบี้ยหงายกับขุนขาวปิดช่องหนี',
        'ไล่ขุนแดงเข้ามุม แล้วให้ม้ารุกในตาสุดท้าย',
        'ปิดช่องหนีก่อน · ม้ารุกตาสุดท้าย',[
        step('เตรียมการ ม้าเดี่ยวกับเบี้ยหงาย · ขุนขาว ข6 กับเบี้ยหงาย ค6 ต้อนขุนแดงเข้ามุม','k:a8 N:e7 K:b6 M:c6',['a8','b6','c6']),
        step('ตาจน · ม้า ค6 รุก ข8 เบี้ยหงาย ข7 ปิด ก8 กับ ค8 ขุนขาวคุม ค7','k:b8 M:b7 K:b6 N:c6',['c6','b7','a8','c8']),
        step('เตรียมการ ม้าคู่ · ม้าสองตัวช่วยกันปิดช่อง ขุนขาว ก6 คุมด้านข้าง','k:b8 N:e7 K:a6 M:b6 N:e6',['b8','a6']),
        step('ตาจน · ม้า ค7 รุก ก8 เบี้ยหงาย ก7 ปิด ข8 ขุนขาวคุม ข7','k:a8 M:a7 N:c7 N:e7 K:a6',['c7','a7','b8','b7'])
      ],[
        mateTask('ม้าเดี่ยวกับเบี้ยหงาย','k:b8 M:b7 K:b6 N:e7','e7','c6','เดินม้า จ7 ไปรุกจน','รุกจน! ม้ารุก เบี้ยหงายปิด ก8 ค8 และขุนขาวคุมช่องที่เหลือ'),
        mateTask('ม้าคู่ แบบที่ 1','k:a8 M:c7 K:a6 N:c8 N:d6','c8','b6','เดินม้า ค8 ไปรุกจน','รุกจน! ม้ารุก เบี้ยหงาย ค7 ปิด ข8 และขุนขาวคุม ก7 ข7'),
        mateTask('ม้าคู่ แบบที่ 2','k:b8 K:a6 N:b6 N:e7 M:d6','e7','c6','เดินม้า จ7 ไปรุกจน','รุกจน! ม้า ค6 รุก ม้า ข6 ปิด ก8 ค8 และเบี้ยหงายปิด ค7'),
        mateTask('ม้าคู่ แบบที่ 3','k:a8 M:a7 N:e6 N:e7 K:a6','e6','c7','เดินม้า จ6 ไปรุกจน','รุกจน! ม้ารุก เบี้ยหงาย ก7 ปิด ข8 และขุนขาวคุม ข7')
      ],'ใช้เพดานของตัวที่นับน้อยที่สุด เช่น ม้า 2 ตัว 32 ตา · ม้า 1 ตัวกับเบี้ยหงาย 64 ตา'),
      lesson('endgame-promoted','ไล่ด้วยเบี้ยหงาย','เบี้ยหงายหลายตัวช่วยกัน',
        'เบี้ยหงาย<strong>เดินเฉียงทีละช่อง</strong> ต้องใช้หลายตัวช่วยกันและมีขุนขาวคุม',
        'วางเบี้ยหงายเป็นคู่ผูกกัน ให้ตัวหนึ่งคุมอีกตัว',
        'เบี้ยผูกกัน · ขุนขาวคุม · รุกจนที่มุม',[
        step('เตรียมการ เบี้ยสองตัว · ขุนขาว ฉ7 คุมมุม เบี้ยหงาย ฉ6 กับเบี้ย ช5 เตรียมขึ้นไป','k:h8 K:f7 M:f6 P:g5',['h8','f7','f6','g5']),
        step('ตาจน · เบี้ยหงาย ช6 รุก ญ7 เบี้ยหงาย ช7 ปิด ญ8 กับ ญ6 ขุนขาวคุม ช8 และ ช6','k:h7 K:f7 M:g7 M:g6',['g6','g7','h8','h6']),
        step('เตรียมการ เบี้ยหงายสามตัว เบี้ยคู่ไม่ผูก · ขยับเบี้ยหงายเข้ามาทีละตัว','k:g8 M:d7 M:g7 M:g4 K:f6',['g8','g7','f6']),
        step('ตาจน · เบี้ยหงาย ช6 รุก ญ7 ตัวที่ ฉ7 ปิด ช8 ตัวที่ ช7 ปิด ญ8 กับ ญ6','k:h7 M:f7 M:g7 M:g6 K:f6',['g6','f7','g7','g8','h8','h6'])
      ],[
        mateTask('เบี้ยสองตัว','k:h7 K:f7 M:g7 P:g5','g5','g6','เดินเบี้ย ช5 ขึ้นไปหงายแล้วรุกจน','รุกจน! เบี้ยหงายที่ ช6 รุก และขุนขาว ฉ7 คุมไว้'),
        mateTask('เบี้ยหงายสามตัว เบี้ยคู่ผูก','k:h7 K:f7 M:g7 M:f5 M:g5','f5','g6','เดินเบี้ยหงาย ฉ5 ไปรุกจน','รุกจน! เบี้ยหงายสามตัวผูกกันเป็นแนว และขุนขาวคุม ช8'),
        mateTask('เบี้ยหงายสามตัว เบี้ยคู่ไม่ผูก','k:h7 M:f7 M:g7 M:f5 K:f6','f5','g6','เดินเบี้ยหงาย ฉ5 ไปรุกจน','รุกจน! ตัวที่ ฉ7 ปิด ช8 ตัวที่ ช7 ปิด ญ8 และขุนขาวคุมตัวรุก')
      ],'เม็ดหรือเบี้ยหงาย 64 ตา')
    ];
  };
})(typeof window==='object'?window:globalThis);
