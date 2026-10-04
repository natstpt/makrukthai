(function(root){
  'use strict';
  function build(previous){
    var order=['board','king','rook','knight','met','khon','pawn','promotion','promoted','setup','capture','check','escape','mate',
      'review','defend','block','take-checker','notation','draw-rules','think','fair-play','game','mini','assessment','finish'];
    var introductions={
      board:['ทุกช่องมีชื่อ ลองดูชื่อบนกระดานกัน','อ่านตัวอักษรก่อน แล้วตามด้วยเลข เช่น ฉ8'],
      king:['นี่คือขุน เราต้องดูแลให้ปลอดภัย','ขุนเดินได้รอบตัว ทีละ 1 ช่อง'],
      rook:['นี่คือเรือ เดินตรงได้ไกล','เดินขึ้น ลง ซ้าย หรือขวา','หมากขวางอยู่ เรือผ่านไม่ได้ แต่กินหมากอีกสีที่ขวางได้'],
      knight:['นี่คือม้า นักกระโดดของเรา','ไป 2 ช่อง แล้วเลี้ยว 1 ช่อง เป็นรูปตัว L','ม้ากระโดดข้ามหมากได้ แต่ลงทับหมากสีเดียวกันไม่ได้'],
      met:['นี่คือเม็ด เดินใกล้ ๆ แบบเฉียง','เดินเฉียงได้ 4 มุม ทีละ 1 ช่อง'],
      khon:['นี่คือโคน ลองดูทางเดินกัน','โคนเดินเฉียง 1 ช่อง หรือเดินหน้าตรง 1 ช่อง'],
      pawn:['นี่คือเบี้ย เดินไปข้างหน้าเท่านั้น','เบี้ยเดินตรง 1 ช่อง ถ้าช่องนั้นว่าง','ถ้าจะกินหมาก ต้องกินเฉียงหน้า 1 ช่อง'],
      promotion:['เบี้ยเดินไปไกลแล้วจะเปลี่ยนร่าง','เบี้ยขาวถึงแถว 6 จะหงายทันที'],
      promoted:['นี่คือเบี้ยหงาย หลังจากเบี้ยเปลี่ยนร่าง','เดินเฉียง 1 ช่อง ทั้งหน้าและหลัง เหมือนเม็ด'],
      setup:['รู้จักหมากครบแล้ว มาจัดกระดานกัน','ฝ่ายละ 16 ตัว ขาวเริ่มก่อน แล้วผลัดกันเดิน'],
      capture:['การกิน คือเดินไปแทนที่หมากอีกสี','กินแล้วเอาตัวที่ถูกกินออก ห้ามกินหมากสีเดียวกัน'],
      check:['รุก แปลว่าหมากกำลังโจมตีขุน','ลองใช้เรือเล็งขุนแดงในแนวตรง'],
      escape:['ขุนถูกรุก ต้องช่วยขุนก่อน','ลองพาขุนหนีไปช่องที่ไม่มีใครโจมตี'],
      mate:['ถ้าขุนถูกรุกและแก้ไม่ได้ เรียกว่ารุกจน','เกมจบแล้ว ฝ่ายที่ถูกรุกจนแพ้'],
      block:['วันนี้ลองช่วยขุนโดยไม่ขยับขุน','พาหมากไปบังทางเรือ ขุนก็ปลอดภัย'],
      'take-checker':['ช่วยขุนได้อีกวิธี: กินตัวที่รุก','หลังจากกินแล้ว ขุนต้องปลอดภัยด้วย'],
      notation:['จดไว้ว่า หมากเดินจากไหนไปไหน','เช่น ม.ข1 - ง2 คือม้าเดินจาก ข1 ไป ง2','ลองเดิน แล้วเลือกบันทึก ไม่ต้องพิมพ์'],
      'draw-rules':['เสมอ คือเกมจบโดยไม่มีผู้ชนะ','อับ คือไม่ถูกรุก แต่ไม่มีตาเดินที่ถูกกติกา'],
      think:['ก่อนจับหมาก หยุดมองสักนิด','ดูเขา → ดูเรา → ค่อยเดิน'],
      'fair-play':['เล่นกับเพื่อนให้สนุกทั้งสองคน','รอคิว เดินเบา ๆ ไม่แน่ใจให้ถามครู'],
      game:['ลองเล่นทั้งกระดาน คุณเป็นฝ่ายขาว','เดินถูก 6 ตาก็ผ่านได้ ไม่จำเป็นต้องชนะ'],
      mini:['ลองเกมสั้นกับคู่ฝึกสีแดง','เล่นให้จบ 3 เกม แพ้หรือเสมอก็เรียนรู้ได้'],
      assessment:['ลองใช้สิ่งที่เรียนมาใน 5 ด่าน','ทำทีละด่าน ผิดแล้วลองใหม่ได้'],
      review:['เริ่มวันที่ 2 ด้วยการทบทวน','ลองเดินม้า โคน และเบี้ยหงายอีกครั้ง'],
      defend:['หมากช่วยดูแลกันได้','เดินไปคุมช่องของเพื่อน เพื่อกินกลับได้'],
      finish:['เก่งมาก! เรียนครบทั้งสองวันแล้ว','ลองเล่นกับเพื่อน และถามครูเมื่อสงสัย']
    };
    return order.map(function(id,index){
      var lesson=previous.find(function(item){return item.id===id;});
      lesson.day=index<14?1:2;
      lesson.teachingSteps=introductions[id]||[lesson.description,lesson.rule];
      lesson.routePuzzle=lesson.type==='move'&&!lesson.challenges;
      if(id==='rook')lesson.demoPieces=[{piece:'rook',side:'white',at:lesson.start},{piece:'pawn',side:'white',at:{r:2,c:3}},{piece:'pawn',side:'black',at:{r:4,c:5}}];
      if(id==='knight')lesson.demoPieces=[{piece:'knight',side:'white',at:lesson.start},{piece:'pawn',side:'white',at:{r:3,c:3}}];
      if(id==='mate'){
        lesson.description='ขุนถูกรุกและไม่มีทางแก้ = รุกจน ถ้ายังหนีได้ เกมยังไม่จบ';
        // Day 1 contrasts mate with an available escape; stalemate belongs to Day 2.
        var mate=lesson.questions[0],escape=lesson.questions[1];
        lesson.questions=[mate,escape,Object.assign({},mate,{pieces:mate.pieces.map(function(pc){return Object.assign({},pc,{at:{r:pc.at.r,c:7-pc.at.c}});})})];
        lesson.questions.forEach(function(q,i){q.choices=[{text:'รุกจนแล้ว',correct:i!==1},{text:'ยังหนีได้',correct:i===1}];q.mission='ขุนแดงถูกรุกจน หรือยังหนีได้?';});
      }
      return lesson;
    });
  }
  // Breadth-first search guarantees every random target can really be reached.
  function routeTargets(Rules,piece,start,distance){
    var visited=new Set([start.r+','+start.c]),frontier=[{at:start,path:[]}],layers=[];
    for(var step=1;step<=distance;step++){
      var next=[];
      frontier.forEach(function(node){
        Rules.legalDestinations([{piece:piece,side:'white',at:node.at}],node.at).forEach(function(at){
          var id=at.r+','+at.c;if(visited.has(id))return;visited.add(id);
          next.push({at:at,path:node.path.concat([at])});
        });
      });
      if(!next.length)break;layers=next;frontier=next;
    }
    return layers;
  }
  var api={build:build,routeTargets:routeTargets};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MakrukLearning=api;
})(typeof window==='object'?window:globalThis);
