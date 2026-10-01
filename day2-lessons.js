/* Day 2: one small task at a time, followed by coached games. */
(function(root){
  'use strict';
  root.buildDay2Lessons=function(previous,pos){
    function pc(piece,side,file,rank){return {piece:piece,side:side,at:pos(file,rank)};}
    function white(piece,file,rank){return pc(piece,'white',file,rank);}
    function red(piece,file,rank){return pc(piece,'black',file,rank);}
    function task(piece,file,rank,goals,mission,friends,enemies,hint,success){
      return {piece:piece,start:pos(file,rank),goals:goals,mission:mission,friends:friends||[],enemies:enemies||[],hint:hint,success:success};
    }
    function exercise(id,title,heading,speech,description,rule,challenges,required){
      return {id:id,title:title,day:2,type:'challenge',piece:challenges[0].piece,
        heading:heading,speech:speech,description:description,rule:rule,challenges:challenges,
        mission:challenges[0].mission,caption:title,hint:'ดูภารกิจทีละข้อ แล้วเลือกหมากฝ่ายขาวที่กำลังฝึก',
        requiredCorrect:required||challenges.length,mainText:'เริ่มฝึก'};
    }
    var review=exercise('review','ทบทวนหมาก','มาลองเดินหมากที่รู้จัก',
      'ลองทบทวน<strong>ทีละตัว</strong> ถ้าจำไม่ได้ เปิดดูคำใบ้ได้',
      'ม้า โคน และเบี้ยหงาย เดินไม่เหมือนกัน',
      'ม้าเป็นตัว L · โคนเฉียงหรือเดินหน้า · เบี้ยหงายเฉียง',[
        task('knight','d',4,[pos('e',6)],'พาม้า ง4 ไป จ6',[],[],'ไป 2 ช่อง แล้วเลี้ยว 1 ช่อง'),
        task('khon','e',4,[pos('e',5)],'พาโคน จ4 เดินหน้าไป จ5',[],[],'โคนเดินหน้าตรงได้ 1 ช่อง'),
        task('promoted','c',5,[pos('d',4)],'พาเบี้ยหงาย ค5 เฉียงถอยหลังไป ง4',[],[],'เบี้ยหงายเดินเฉียงถอยหลังได้')
      ]);
    var capture=exercise('capture','กินหมาก','กินหมากของอีกฝ่าย',
      'กินหมาก คือ<strong>เดินไปช่องที่มีหมากอีกฝ่าย</strong> แล้วเอาหมากนั้นออก',
      'เรือเดินตรง ม้าเดินตัว L ส่วนเบี้ยกินเฉียง',
      'เดินไปแทนที่หมากแดง',[
        task('rook','a',4,[pos('e',4)],'ให้เรือ ก4 กินหมากที่ จ4',[],[red('pawn','e',4)],'เรือกินตามทางตรง'),
        task('knight','d',4,[pos('f',5)],'ให้ม้า ง4 กินหมากที่ ฉ5',[],[red('khon','f',5)],'ม้าไป 2 ช่อง แล้วเลี้ยว 1 ช่อง'),
        task('pawn','c',4,[pos('d',5)],'ให้เบี้ย ค4 กินหมากที่ ง5',[],[red('pawn','d',5)],'เบี้ยกินเฉียงหน้า 1 ช่อง')
      ]);
    var defend=exercise('defend','ช่วยเพื่อนป้องกันหมาก','ช่วยกันดูแลหมาก',
      'หมากของเรา<strong>ช่วยกันป้องกันเพื่อนได้</strong>',
      'พาหมากไปอยู่ใกล้เพื่อน เพื่อช่วยเฝ้าช่องของเพื่อน',
      'พาหมากไปช่วยเพื่อน',[
        task('met','c',2,[pos('d',3)],'พาเม็ด ค2 ไปช่วยเฝ้าเบี้ย จ4',
          [white('king','a',1),white('pawn','e',4)],[red('king','h',8),red('knight','g',5)],
          'เม็ดที่ ง3 จะกินเฉียงไป จ4 ได้','เม็ด ง3 คุมเบี้ย จ4 แล้ว ถ้าม้าแดงกินเบี้ย เม็ดจะกินกลับได้'),
        task('khon','e',2,[pos('d',3),pos('e',3)],'พาโคน จ2 ไปช่วยเฝ้าเรือ ง4',
          [white('king','a',1),white('rook','d',4)],[red('king','h',8),red('rook','d',8)],
          'โคนคุมเรือได้จาก ง3 (ตรงหน้า) หรือ จ3 (เฉียง)','โคนคุมเรือ ง4 แล้ว ถ้าเรือแดงกิน จะมีโคนกินกลับ'),
        task('rook','a',2,[pos('d',2),pos('a',4)],'พาเรือ ก2 ไปช่วยเฝ้าม้า ง4',
          [white('king','a',1),white('knight','d',4)],[red('king','h',8),red('rook','d',8)],
          'เรือคุมแนวตรง ลอง ง2 หรือ ก4','เรืออยู่ในแนวเดียวกับม้า ง4 แล้ว พร้อมกินกลับถ้าม้าถูกกิน')
      ]);
    var block=exercise('block','บังทางเรือ','ช่วยขุนด้วยการบังเรือ',
      'ถ้าเรือรุกขุนเป็นเส้นตรง เราอาจ<strong>เอาหมากไปยืนขวาง</strong>ได้',
      'พาหมากไปยืนระหว่างเรือแดงกับขุนขาว',
      'วางหมากขวางระหว่างเรือกับขุน',[
        task('rook','a',3,[pos('d',3)],'วางเรือ ก3 ขวางระหว่างเรือแดงกับขุน',
          [white('king','d',1)],[red('rook','d',8),red('king','h',8)],'พาเรือไป ง3'),
        task('khon','f',2,[pos('e',3)],'วางโคน ฉ2 ขวางทางเรือแดง',
          [white('king','e',1)],[red('rook','e',8),red('king','a',8)],'พาโคนไป จ3'),
        task('knight','a',1,[pos('c',2)],'วางม้า ก1 ขวางทางเรือแดง',
          [white('king','c',1)],[red('rook','c',8),red('king','h',8)],'พาม้าไป ค2')
      ]);
    var takeChecker=exercise('take-checker','กินหมากที่กำลังรุก','หยุดเรือที่กำลังรุก',
      'บางครั้งช่วยขุนได้โดย<strong>กินหมากที่กำลังรุก</strong>',
      'กินเรือแดง แล้วดูว่าขุนปลอดภัยหรือยัง',
      'กินเรือที่กำลังรุก',[
        task('king','d',4,[pos('d',5)],'ใช้ขุน ง4 กินเรือที่ ง5',[],[red('rook','d',5),red('king','h',8)],'เรือไม่มีหมากแดงคอยป้องกัน'),
        task('knight','f',2,[pos('d',3)],'ใช้ม้า ฉ2 กินเรือที่ ง3',
          [white('king','d',1)],[red('rook','d',3),red('king','h',8)],'ม้าไปซ้าย 2 แล้วขึ้น 1'),
        task('rook','a',3,[pos('d',3)],'ใช้เรือ ก3 กินเรือที่ ง3',
          [white('king','d',1)],[red('rook','d',3),red('king','h',8)],'เรือเดินตรงไปกินได้')
      ]);
    var mate=previous[11];
    mate.title='รุกจนหรือยัง';mate.heading='รุกจนหรือยัง?';
    mate.speech='ขุนถูกรุกและ<strong>ช่วยให้ปลอดภัยไม่ได้</strong> เรียกว่า “รุกจน”';
    mate.description='ขุนถูกรุกและไม่มีทางแก้ = แพ้ · ไม่ถูกรุกและเดินไม่ได้ = เสมอ';
    mate.rule='รุกจน = ถูกรุกและแก้ไม่ได้';
    mate.requiredCorrect=3;
    function mateChoices(correct){return ['รุกจน · แพ้','ยังหนีได้','เสมอ · ไม่ถูกรุกและเดินไม่ได้'].map(function(text,i){return {text:text,correct:i===correct};});}
    mate.questions=[
      {mission:'ขุนแดงถูกรุกและหนีไม่ได้ เรียกว่าอะไร?',pieces:[white('rook','h',1),white('king','f',7),red('king','h',8)],choices:mateChoices(0),hint:'ดูว่าขุนหนีได้ไหม',explanation:'รุกจน · หนีรุกไม่ได้ = แพ้'},
      {mission:'ขุนแดงถูกรุก แต่ยังหนีได้ แปลว่าอะไร?',pieces:[white('rook','h',1),white('king','a',1),red('king','h',8)],choices:mateChoices(1),hint:'มองหาช่องที่ปลอดภัย',explanation:'ยังไม่รุกจน เพราะขุนยังหนีได้'},
      {mission:'ขุนไม่ถูกรุก แต่เดินไม่ได้ เรียกว่าอะไร?',pieces:[white('king','f',7),white('met','g',6),red('king','h',8)],choices:mateChoices(2),hint:'ขุนไม่ถูกโจมตี แต่ไม่มีที่เดิน',explanation:'เสมอ · ขุนไม่ถูกรุกและไม่มีตาเดิน'}
    ];
    var think=previous[12];think.requiredCorrect=3;
    think.title='คิดก่อนเดิน';think.speech='ก่อนเดิน ลองหยุดคิดสักนิด';think.heading='ดูเขา → ดูเรา → ค่อยเดิน';
    think.description='มองหมากของอีกฝ่าย แล้วดูว่าหมากของเราปลอดภัยไหม';
    think.rule='ดูเขา → ดูเรา → ค่อยเดิน';
    think.questions=[
      {mission:'ขุนกำลังถูกรุก เราควรทำอย่างไร?',pieces:[white('king','d',4),white('rook','a',1),red('rook','d',8),red('king','h',8)],choices:[{text:'ช่วยขุนให้ปลอดภัยก่อน',correct:true},{text:'เดินตัวอื่นก่อน',correct:false},{text:'ไม่ต้องสนใจ',correct:false}],hint:'ช่วยขุนก่อนนะ',explanation:'ใช่แล้ว! ช่วยขุนก่อนเสมอ'},
      {mission:'เรือจะกินหมาก แต่มีเรือแดงเล็งอยู่ ควรคิดอะไร?',pieces:[white('king','a',1),white('rook','d',1),red('pawn','d',4),red('rook','h',4),red('king','h',8)],choices:[{text:'เรือแดงจะกินเรากลับไหม?',correct:true},{text:'กินได้ก็ต้องกินทันที',correct:false},{text:'ไม่มีหมากแดงอยู่ใกล้',correct:false}],hint:'มองตามแนวเรือแดง',explanation:'ดูก่อนว่าหมากเราจะปลอดภัยไหม'},
      {mission:'ก่อนเดินหมาก ควรมองอะไรบ้าง?',pieces:[white('king','a',1),white('met','c',2),white('pawn','e',4),red('knight','g',5),red('king','h',8)],choices:[{text:'ดูเขา แล้วดูหมากของเรา',correct:true},{text:'ดูแต่ช่องว่าง',correct:false},{text:'รีบเดินทันที',correct:false}],hint:'อย่าเพิ่งรีบเดิน',explanation:'มองหมากอีกฝ่ายก่อน แล้วค่อยเลือกตาของเรา'}
    ];
    var game={id:'game',title:'เกมฝึกเต็มกระดาน',day:2,type:'game',fullSetup:true,requiredCorrect:6,
      speech:'ลองเล่นเกมจริงทีละตา คุณเล่นฝ่ายขาว คู่ฝึกเป็นฝ่ายแดง',
      heading:'เล่นเกม · ทีละตา',description:'เลือกหมากขาว แล้วเลือกช่องที่จะเดิน ครูช่วยดูได้',
      rule:'ขาวเดินก่อน · ผลัดกันเดิน',
      mission:'เดินให้ถูก 6 ครั้ง แล้วเล่นต่อได้',caption:'คุณเล่นฝ่ายขาว',
      hint:'ลองเดินเบี้ยหรือม้าก่อน ถ้าขุนถูกรุกให้ช่วยขุน',mainText:'เริ่มเกมฝึก'};
    var mini={id:'mini',title:'เกมสั้น 3 รอบ',day:2,type:'game',requiredCorrect:3,requiredGames:3,
      speech:'มาเล่น<strong>เกมสั้น 3 รอบ</strong> ไม่ต้องชนะก็ได้ ลองคิดและสนุกกับการเดิน',
      heading:'เกมสั้น · ฝึกทีละรอบ',description:'เล่นให้จบ 3 รอบ แพ้หรือเสมอก็ไม่เป็นไร เราฝึกเพื่อให้เก่งขึ้น',
      rule:'ลองให้ครบ 3 รอบ',
      mission:'ลองหารุกจน หรือเล่นต่อจนเกมจบ',caption:'เกมสั้นที่ 1',
      hint:'มองแนวเรือและช่องหนีที่ขุนขาวคุมอยู่',mainText:'เริ่มมินิเกม',
      games:[
        {pieces:[white('king','f',7),white('rook','a',1),red('king','h',8)],hint:'เรือ ก1 ไป ญ1 จะรุก ขุนขาว ฉ7 คุมช่องหนี'},
        {pieces:[white('king','c',7),white('rook','h',1),red('king','a',8)],hint:'เรือ ญ1 ไป ก1 จะรุก ขุนขาว ค7 คุมช่องหนี'},
        {pieces:[white('king','f',2),white('rook','a',8),red('king','h',1)],hint:'เรือ ก8 ไป ญ8 จะรุก ขุนขาว ฉ2 คุมช่องหนี'}
      ]};
    var assessment=exercise('assessment','ลองทำ 5 ภารกิจ','ลองเองทีละข้อ',
      'ทำทีละข้อได้เลย ถ้าพลาด<strong>ลองใหม่ได้</strong>',
      'ลองเดินม้า หงายเบี้ย กินหมาก ช่วยขุน และรุกจน',
      'ทำให้ครบ 5 ข้อ',[
        task('knight','d',4,[pos('f',5)],'1 · พาม้า ง4 ไป ฉ5',[],[],'ไป 2 ช่อง แล้วเลี้ยว 1 ช่อง'),
        task('pawn','e',5,[pos('e',6)],'2 · พาเบี้ย จ5 ไปแถว 6',[],[],'เบี้ยถึงแถว 6 แล้วหงาย'),
        task('promoted','d',4,[pos('e',5)],'3 · ให้เบี้ยหงาย ง4 กินหมาก จ5',[],[red('pawn','e',5)],'เบี้ยหงายกินเฉียง 1 ช่อง'),
        task('rook','a',3,[pos('d',3)],'4 · ช่วยขุนโดยบังเรือแดง',
          [white('king','d',1)],[red('rook','d',8),red('king','h',8)],'เรือ ก3 ไป ง3 จะบังแนวรุก'),
        task('rook','a',1,[pos('h',1)],'5 · พาเรือ ก1 รุกจนขุนแดง ญ8',
          [white('king','f',7)],[red('king','h',8)],'เรือไป ญ1 จะรุก และขุนขาวคุม ช8 กับ ช7','รุกจน! เรือคุมแนว ญ และขุนขาวคุมทุกช่องหนี')
      ],5);
    var finish=previous[13];finish.description='คุณผ่านทั้งการเดินหมาก การกินและป้องกัน การแก้รุก เกมฝึก และประเมิน 5 ด่านแล้ว ชวนเพื่อนเล่นโดยให้ครูช่วยดูช่วงปลายเกม';
    return previous.slice(0,9).concat([review,capture,defend,previous[9],previous[10],block,takeChecker,mate,think,game,mini,assessment,finish]);
  };
})(window);
