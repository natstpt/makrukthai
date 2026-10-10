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
      escape:['ขุนถูกรุก ต้องช่วยขุนก่อน','เดินขุนไปช่องที่หมากแดงกินไม่ได้'],
      mate:['ถ้าขุนถูกรุกและแก้ไม่ได้ เรียกว่ารุกจน','เกมจบแล้ว ฝ่ายที่ถูกรุกจนแพ้'],
      block:['เรือแดงกำลังรุกขุนของเรา ลองหาตัวมาบังทาง','เดินหมากไปบังช่องดาว ให้ขุนปลอดภัย และมีตัวคอยป้องกันหมากที่บัง','ถ้าเรือแดงกินตัวบัง ขุนของเรากินเรือกลับได้ จึงไม่เสียหมากฟรี'],
      'take-checker':['ช่วยขุนได้อีกวิธี: กินตัวที่รุก','หลังจากกินแล้ว ขุนต้องปลอดภัยด้วย'],
      notation:[
        'การจดหมาก คือเขียนสั้น ๆ ว่า ตัวไหนเดิน จากช่องไหน ไปช่องไหน',
        'ข. = ขุน ตัวที่เราต้องดูแลให้ปลอดภัย',
        'ร. = เรือ ตัวที่เดินตรงได้ไกล',
        'ม. = ม้า ตัวที่เดินเป็นรูปตัว L',
        'ค. = โคน ตัวที่เดินเฉียง หรือเดินหน้าตรง 1 ช่อง',
        'ม็. = เม็ด สังเกตไม้ไต่คู้บน ม เพื่อไม่ให้สับสนกับม้า',
        'บ. = เบี้ย ก่อนถึงแถวที่ต้องหงาย',
        'ง. = เบี้ยหงาย เบี้ยที่หงายแล้วใช้ชื่อนี้',
        '− แปลว่าเดิน เช่น ม.ข1 - ง2 คือ ม้าเดินจาก ข1 ไป ง2',
        '× แปลว่ากิน เช่น ร.ก4 × บ.ง4 คือ เรือจาก ก4 กินเบี้ยที่ ง4',
        '+ ต่อท้าย แปลว่ารุก ขุนอีกฝ่ายต้องแก้รุกก่อนเดินอย่างอื่น',
        '# ต่อท้าย แปลว่ารุกจน ขุนถูกรุกและไม่มีวิธีแก้ เกมจบแล้ว',
        'เบี้ยถึงแถวหงาย ตานั้นยังจด บ. ตาถัดไปจึงใช้ ง.',
        'ผลเกม: 1-0 ขาวชนะ · 0-1 แดงชนะ · ½-½ เสมอ',
        'ลองทีละข้อ: เดินหมากตามโจทย์ แล้วดูว่าตานั้นจดอย่างไร เปิดตารางช่วยจำได้เสมอ'
      ],
      'draw-rules':['เสมอ คือเกมจบโดยไม่มีผู้ชนะ','อับ คือไม่ถูกรุก แต่ไม่มีตาเดินที่ถูกกติกา'],
      think:['ก่อนจับหมาก หยุดมองสักนิด','ดูเขา → ดูเรา → ค่อยเดิน'],
      'fair-play':['เล่นกับเพื่อนให้สนุกทั้งสองคน','รอคิว เดินเบา ๆ ไม่แน่ใจให้ถามกรรมการ'],
      game:['ลองเล่นทั้งกระดาน คุณเป็นฝ่ายขาว','เดินถูก 6 ตาก็ผ่านได้ ไม่จำเป็นต้องชนะ'],
      mini:['ลองเกมสั้นกับคู่ฝึกสีแดง','เล่นให้จบ 3 เกม แพ้หรือเสมอก็เรียนรู้ได้'],
      assessment:['ลองใช้สิ่งที่เรียนมาใน 5 ด่าน','ทำทีละด่าน ผิดแล้วลองใหม่ได้'],
      review:['ขุน โคน เม็ด หน้าตาคล้ายกัน ลองเทียบความสูงจากฐานเดียวกัน','ขุนสูงที่สุด อยู่ช่อง ง4 เดินรอบตัวได้ 8 ทาง ทีละ 1 ช่อง','โคนสูงปานกลาง อยู่ช่อง ง4 เหมือนเดิม เดินเฉียง 4 ทาง และหน้าตรง 1 ทาง','เม็ดเตี้ยที่สุด อยู่ช่อง ง4 เหมือนเดิม เดินเฉียง 4 ทางเท่านั้น','จำง่าย ๆ: ขุนรอบตัว โคนเฉียงกับหน้า เม็ดเฉียงเท่านั้น แล้วลองฝึกทีละตัว'],
      defend:['การผูกหมาก คือวิธีวางหมากให้คอยป้องกันดูแลฝั่งเดียวกัน','เมื่อโดนกินจะมีตัวหมากสามารถกินกลับได้ทันที','ดูทางเดินให้ถึงช่องของหมากที่เราจะป้องกัน ไม่ใช่แค่วางอยู่ใกล้กัน'],
      finish:['เก่งมาก! เรียนครบทุกบทแล้ว','ลองเล่นกับเพื่อน และถามกรรมการเมื่อสงสัย']
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
      if(id==='check')lesson.challenges.forEach(function(task){var king=task.enemies.find(function(pc){return pc.piece==='king';});task.goal={r:task.start.r,c:king.at.c};});
      if(id==='notation')lesson.primerPieces=[null,'king','rook','knight','khon','met','pawn','promoted'];
      ['speech','heading','description','rule','mission','caption','hint'].forEach(function(key){
        if(typeof lesson[key]==='string')lesson[key]=lesson[key].replace(/พา/g,'เดิน').replace(/ครบเกณฑ์แล้ว/g,'ครบแล้ว').replace(/ถามกรรมการให้ช่วยนับและอธิบาย/g,'ขอให้กรรมการอธิบายกติกาข้อนี้');
      });
      lesson.teachingSteps=lesson.teachingSteps.map(function(text){return text.replace(/พา/g,'เดิน');});
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

