/* Independent teaching editor. FEN roles follow PyChess Makruk (s, m, m~).
 * No PyChess application code is included. Counting history is not imported. */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./makruk-rules.js'):root.MakrukRules);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.MakrukEditor=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  var roles={k:'king',r:'rook',n:'knight',s:'khon',m:'met',p:'pawn'};
  var letters={king:'k',rook:'r',knight:'n',khon:'s',met:'m',pawn:'p',promoted:'m'};
  var initial='rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
  function parse(text){
    var fields=text.trim().split(/\s+/);
    if(fields.length!==6||!['w','b'].includes(fields[1])||fields[2]!=='-'||fields[3]!=='-'||fields[4]!=='0'||!(/^[1-9]\d*$/.test(fields[5])))
      throw Error('ใช้ FEN หมากรุกไทย 6 ส่วน โดยไม่มีสิทธิ์พิเศษหรือข้อมูลการนับ (ลงท้าย w - - 0 1 หรือ b - - 0 1)');
    var rows=fields[0].split('/'),pieces=[];
    if(rows.length!==8) throw Error('รหัสต้องมีกระดาน 8 แถว');
    rows.forEach(function(row,r){var c=0;
      for(var i=0;i<row.length;i++){
        var ch=row[i];
        if(/[1-8]/.test(ch)){c+=Number(ch);continue;}
        var role=roles[ch.toLowerCase()];
        if(!role||c>=8) throw Error('รหัสมีตัวหมากหรือจำนวนช่องไม่ถูกต้อง');
        if(row[i+1]==='~'){if(role!=='met') throw Error('เบี้ยหงายใช้ M~ หรือ m~');role='promoted';i++;}
        pieces.push({piece:role,side:ch===ch.toUpperCase()?'white':'black',at:{r:r,c:c++}});
      }
      if(c!==8) throw Error('แต่ละแถวต้องมี 8 ช่อง');
    });
    return {pieces:pieces,turn:fields[1]==='w'?'white':'black'};
  }
  function fen(state){
    var rows=[];
    for(var r=0;r<8;r++){var row='',empty=0;
      for(var c=0;c<8;c++){
        var p=state.pieces.find(function(p){return p.at.r===r&&p.at.c===c;});
        if(!p){empty++;continue;}if(empty){row+=empty;empty=0;}
        var ch=letters[p.piece];row+=p.side==='white'?ch.toUpperCase():ch;
        if(p.piece==='promoted')row+='~';
      }
      if(empty)row+=empty;rows.push(row);
    }
    return rows.join('/')+' '+(state.turn==='white'?'w':'b')+' - - 0 1';
  }
  function validate(state){
    for(var side of ['white','black']){
      if(state.pieces.filter(function(p){return p.side===side&&p.piece==='king';}).length!==1)
        return 'ก่อนทดลองเดิน ต้องมีขุนขาว 1 ตัว และขุนแดง 1 ตัว';
    }
    if(R.inCheck(state.pieces,'white')&&R.inCheck(state.pieces,'black'))return 'ขุนทั้งสองฝ่ายโดนรุกพร้อมกัน กรุณาจัดตำแหน่งใหม่';
    if(R.inCheck(state.pieces,state.turn==='white'?'black':'white'))return 'ฝ่ายที่ไม่ได้เดินกำลังโดนรุก ให้เปลี่ยนฝ่ายเดินหรือจัดตำแหน่งใหม่';
    if(state.pieces.some(function(p){return p.piece==='pawn'&&(p.side==='white'?p.at.r<=2:p.at.r>=5);}))
      return 'เบี้ยที่ถึงหรือเลยแถวหงายแล้ว ต้องเปลี่ยนเป็นเบี้ยหงายก่อนทดลองเดิน';
    return '';
  }
  return {parse:parse,fen:fen,validate:validate,initial:function(){return parse(initial);}};
});
